import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  type ExecutePreviewBindingDiagnostic,
  type ExecutePreviewBindingInput,
  type ExecutePreviewBindingResult,
  validateExecutePreviewBinding
} from "./execute-binding.js";

export type PreviewRecordStatus = "active" | "expired" | "invalid";

export interface PreviewRecordInput {
  previewId?: unknown;
  tool: string;
  target: unknown;
  summary?: unknown;
  proposedChanges?: unknown;
  requiredConfirmationForExecute?: unknown;
  auditContext?: unknown;
  createdAt?: Date | string;
  expiresAt?: Date | string;
  status?: PreviewRecordStatus;
}

export interface StoredPreviewRecord {
  previewId: string;
  tool: string;
  target: unknown;
  summary?: unknown;
  proposedChanges?: unknown;
  requiredConfirmationForExecute?: unknown;
  auditContext?: unknown;
  createdAt: string;
  expiresAt: string;
  previewHash: string;
  reviewedChangesHash?: string;
  status: PreviewRecordStatus;
}

export interface PreviewStoreLookupResult {
  ok: boolean;
  status: "active" | "expired" | "invalid" | "missing";
  record?: StoredPreviewRecord;
  diagnostic?: ExecutePreviewBindingDiagnostic;
}

export interface PreviewStoreReviewResult extends PreviewStoreLookupResult {
  reviewedChangesHash?: string;
}

export interface StoredPreviewReviewPayload {
  tool: string;
  target: unknown;
  summary?: unknown;
  proposedChanges?: unknown;
  requiredConfirmationForExecute?: unknown;
  auditContext?: unknown;
}

export interface MemoryPreviewStoreOptions {
  ttlMs?: number;
  now?: () => Date;
}

export interface FilePreviewStoreOptions extends MemoryPreviewStoreOptions {
  path: string;
}

const defaultTtlMs = 24 * 60 * 60 * 1000;
const redacted = "[redacted]";
const omitted = "[omitted]";
const maxStringLength = 180;
const maxArrayItems = 20;
const maxObjectFields = 20;
const maxDepth = 5;

export class MemoryPreviewStore {
  private readonly records = new Map<string, StoredPreviewRecord>();
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(options: MemoryPreviewStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? defaultTtlMs;
    this.now = options.now ?? (() => new Date());
  }

  savePreview(input: PreviewRecordInput): StoredPreviewRecord {
    const createdAt = parseDate(input.createdAt) ?? this.now();
    const expiresAt = parseDate(input.expiresAt) ?? new Date(createdAt.getTime() + this.ttlMs);
    const tool = safeString(input.tool) ?? "unknown.preview";
    const target = sanitizePreviewValue(input.target);
    const summary = sanitizePreviewValue(input.summary);
    const proposedChanges = sanitizePreviewValue(input.proposedChanges);
    const requiredConfirmationForExecute = sanitizePreviewValue(input.requiredConfirmationForExecute);
    const auditContext = sanitizePreviewValue(input.auditContext);
    const reviewPayload = {
      tool,
      target,
      summary,
      proposedChanges,
      requiredConfirmationForExecute,
      auditContext
    };
    const previewHash = hashPreviewContent(reviewPayload);
    const previewId = safePreviewId(input.previewId) ?? `preview_${randomUUID()}`;
    const record: StoredPreviewRecord = {
      previewId,
      tool,
      target,
      summary,
      proposedChanges,
      requiredConfirmationForExecute,
      auditContext,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      previewHash,
      status: input.status ?? "active"
    };

    this.records.set(previewId, record);
    this.afterChange();
    return safeRecord(record);
  }

  getPreview(previewId: unknown): PreviewStoreLookupResult {
    const safeId = safePreviewId(previewId);
    if (!safeId) return missingPreview();
    const record = this.records.get(safeId);
    if (!record) return missingPreview();
    if (record.status === "invalid") return invalidPreview(record);
    if (record.status === "expired" || isExpired(record, this.now())) {
      const expired = { ...record, status: "expired" as const };
      this.records.set(record.previewId, expired);
      this.afterChange();
      return expiredPreview(expired);
    }
    return { ok: true, status: "active", record: safeRecord(record) };
  }

  markReviewed(previewId: unknown, reviewedPayload: unknown): PreviewStoreReviewResult {
    const lookup = this.getPreview(previewId);
    if (!lookup.ok || !lookup.record) return lookup;
    const reviewedChangesHash = hashPreviewContent(reviewedPayload);
    const updated: StoredPreviewRecord = {
      ...lookup.record,
      reviewedChangesHash
    };
    this.records.set(updated.previewId, updated);
    this.afterChange();
    return { ok: true, status: "active", record: safeRecord(updated), reviewedChangesHash };
  }

  expirePreview(previewId: unknown): PreviewStoreLookupResult {
    const safeId = safePreviewId(previewId);
    if (!safeId) return missingPreview();
    const record = this.records.get(safeId);
    if (!record) return missingPreview();
    const expired: StoredPreviewRecord = { ...record, status: "expired" };
    this.records.set(safeId, expired);
    this.afterChange();
    return expiredPreview(expired);
  }

  listPreviews(): StoredPreviewRecord[] {
    return Array.from(this.records.keys()).map((previewId) => this.getPreview(previewId).record).filter((record): record is StoredPreviewRecord => Boolean(record));
  }

  protected restorePreview(record: StoredPreviewRecord): void {
    const safeId = safePreviewId(record.previewId);
    const safeTool = safeString(record.tool);
    if (!safeId || !safeTool) return;
    const restored: StoredPreviewRecord = {
      previewId: safeId,
      tool: safeTool,
      target: sanitizePreviewValue(record.target),
      summary: sanitizePreviewValue(record.summary),
      proposedChanges: sanitizePreviewValue(record.proposedChanges),
      requiredConfirmationForExecute: sanitizePreviewValue(record.requiredConfirmationForExecute),
      auditContext: sanitizePreviewValue(record.auditContext),
      createdAt: parseDate(record.createdAt)?.toISOString() ?? new Date(0).toISOString(),
      expiresAt: parseDate(record.expiresAt)?.toISOString() ?? new Date(0).toISOString(),
      previewHash: hashPreviewContent({
        tool: safeTool,
        target: sanitizePreviewValue(record.target),
        summary: sanitizePreviewValue(record.summary),
        proposedChanges: sanitizePreviewValue(record.proposedChanges),
        requiredConfirmationForExecute: sanitizePreviewValue(record.requiredConfirmationForExecute),
        auditContext: sanitizePreviewValue(record.auditContext)
      }),
      reviewedChangesHash: safeString(record.reviewedChangesHash),
      status: isPreviewRecordStatus(record.status) ? record.status : "invalid"
    };
    this.records.set(safeId, restored);
  }

  protected allRecords(): StoredPreviewRecord[] {
    return Array.from(this.records.values()).map((record) => safeRecord(record));
  }

  protected afterChange(): void {
    // Extension point for durable preview stores.
  }
}

export class FilePreviewStore extends MemoryPreviewStore {
  private readonly path: string;
  private loading = true;

  constructor(options: FilePreviewStoreOptions) {
    super(options);
    this.path = options.path;
    this.loadFromDisk();
    this.loading = false;
  }

  protected override afterChange(): void {
    if (this.loading) return;
    this.persist();
  }

  private loadFromDisk(): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
      return;
    }

    const records = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: unknown }).records) ? (parsed as { records: unknown[] }).records : [];
    for (const item of records) {
      if (item && typeof item === "object") this.restorePreview(item as StoredPreviewRecord);
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const tempPath = `${this.path}.tmp`;
    const payload = {
      version: 1,
      records: this.allRecords()
    };
    writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    renameSync(tempPath, this.path);
  }
}

export function defaultPreviewStorePath(home = homedir()): string {
  return join(home, ".shopify-store-agent", "previews.json");
}

export function hashPreviewContent(value: unknown): string {
  const canonical = canonicalizePreviewValue(sanitizePreviewValue(value));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function canonicalizePreviewValue(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sanitizePreviewValue(value: unknown, key = "", depth = 0): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (isSecretKey(key) || looksLikeSecret(value)) return redacted;
    if (looksLikeUrl(value)) return sanitizeUrl(value);
    return truncate(value.trim(), maxStringLength);
  }
  if (Array.isArray(value)) {
    return {
      count: value.length,
      items: value.slice(0, maxArrayItems).map((item) => sanitizePreviewValue(item, key, depth + 1)),
      omittedItemCount: Math.max(0, value.length - maxArrayItems)
    };
  }
  if (typeof value !== "object") return omitted;
  if (depth >= maxDepth) return omitted;

  if (isSanitizedArraySummary(value)) {
    const items = value.items.slice(0, maxArrayItems);
    return {
      count: value.count,
      items: items.map((item) => sanitizePreviewValue(item, key, depth + 1)),
      omittedItemCount: value.omittedItemCount + Math.max(0, value.items.length - items.length)
    };
  }
  if (isSanitizedObjectSummary(value)) {
    const entries = Object.entries(value.fields).slice(0, maxObjectFields);
    return {
      fields: Object.fromEntries(entries.map(([entryKey, entryValue]) => [safeObjectKey(entryKey), sanitizePreviewValue(entryValue, entryKey, depth + 1)])),
      omittedFieldCount: value.omittedFieldCount + Math.max(0, Object.keys(value.fields).length - entries.length)
    };
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, maxObjectFields);
  return {
    fields: Object.fromEntries(entries.map(([entryKey, entryValue]) => [safeObjectKey(entryKey), sanitizePreviewValue(entryValue, entryKey, depth + 1)])),
    omittedFieldCount: Math.max(0, Object.keys(value as Record<string, unknown>).length - entries.length)
  };
}

export function previewRecordBindingTarget(record: StoredPreviewRecord): string {
  const target = record.target;
  if (typeof target === "string" && target.trim()) return target.trim();
  if (!target || typeof target !== "object" || !("fields" in target)) return record.previewId;
  const fields = (target as { fields?: Record<string, unknown> }).fields;
  const value = stringFromUnknown(fields?.id) ?? stringFromUnknown(fields?.handle) ?? stringFromUnknown(fields?.title) ?? stringFromUnknown(fields?.url) ?? stringFromUnknown(fields?.type);
  return value ?? record.previewId;
}

export function reviewedPayloadForPreviewRecord(record: StoredPreviewRecord): StoredPreviewReviewPayload {
  return {
    tool: record.tool,
    target: record.target,
    summary: record.summary,
    proposedChanges: record.proposedChanges,
    requiredConfirmationForExecute: record.requiredConfirmationForExecute,
    auditContext: record.auditContext
  };
}

export function verifyStoredPreviewBinding(
  store: MemoryPreviewStore,
  input: ExecutePreviewBindingInput,
  context: { executeTool: string; expectedPreviewTool: string; target?: string }
): ExecutePreviewBindingResult {
  const lookup = store.getPreview(input.previewId);
  if (!lookup.ok || !lookup.record) {
    const fallback = validateExecutePreviewBinding(input, {
      executeTool: context.executeTool,
      expectedPreviewTool: context.expectedPreviewTool,
      target: context.target ?? ""
    });
    return {
      ...fallback,
      ok: false,
      diagnostics: [lookup.diagnostic ?? diagnostic("stored_preview_unavailable", "Stored preview was unavailable."), ...fallback.diagnostics]
    };
  }

  const storedTarget = previewRecordBindingTarget(lookup.record);
  const computedReviewedHash = isReviewedPayload(input.reviewedPayload) ? hashPreviewContent(input.reviewedPayload) : undefined;
  const validation = validateExecutePreviewBinding({
    ...input,
    expectedTool: input.expectedTool ?? lookup.record.tool,
    target: input.target ?? storedTarget,
    previewHash: input.previewHash ?? lookup.record.previewHash
  }, {
    executeTool: context.executeTool,
    expectedPreviewTool: context.expectedPreviewTool,
    target: context.target ?? storedTarget
  });

  const diagnostics: ExecutePreviewBindingDiagnostic[] = [...validation.diagnostics];
  if (input.expectedTool && input.expectedTool !== lookup.record.tool) diagnostics.push(diagnostic("stored_preview_tool_mismatch", "Execute binding tool does not match the stored preview."));
  if (input.target && String(input.target).trim() !== storedTarget) diagnostics.push(diagnostic("stored_preview_target_mismatch", "Execute binding target does not match the stored preview."));
  if (input.previewHash && input.previewHash !== lookup.record.previewHash) diagnostics.push(diagnostic("stored_preview_hash_mismatch", "Execute binding hash does not match the stored preview."));
  if (computedReviewedHash && computedReviewedHash !== lookup.record.previewHash) diagnostics.push(diagnostic("reviewed_payload_hash_mismatch", "Reviewed payload hash does not match the stored preview."));
  if (typeof input.reviewedChangesHash === "string" && computedReviewedHash && input.reviewedChangesHash !== computedReviewedHash) {
    diagnostics.push(diagnostic("reviewed_changes_hash_mismatch", "Reviewed changes hash does not match the actual reviewed payload."));
  }
  if (typeof input.reviewedChangesHash === "string" && input.reviewedChangesHash !== lookup.record.previewHash) {
    diagnostics.push(diagnostic("reviewed_changes_hash_mismatch", "Reviewed changes hash does not match the stored preview."));
  }

  return {
    ...validation,
    ok: diagnostics.length === 0,
    diagnostics
  };
}

function isReviewedPayload(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalValue(object[key])]));
}

function safeRecord(record: StoredPreviewRecord): StoredPreviewRecord {
  return {
    ...record,
    previewId: safePreviewId(record.previewId) ?? redacted,
    tool: safeString(record.tool) ?? "unknown.preview",
    target: record.target,
    summary: record.summary,
    proposedChanges: record.proposedChanges,
    requiredConfirmationForExecute: record.requiredConfirmationForExecute,
    auditContext: record.auditContext,
    reviewedChangesHash: record.reviewedChangesHash ? safeHash(record.reviewedChangesHash) : undefined,
    previewHash: safeHash(record.previewHash)
  };
}

function safePreviewId(value: unknown): string | undefined {
  const safe = safeString(value);
  if (!safe || safe === redacted) return undefined;
  return safe;
}

function safeHash(value: string): string {
  return looksLikeSecret(value) ? redacted : truncate(value.trim(), maxStringLength);
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return redacted;
  return truncate(value.trim(), maxStringLength);
}

function safeObjectKey(value: string): string {
  return isSecretKey(value) ? redacted : truncate(value, 80);
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isSanitizedArraySummary(value: object): value is { count: number; items: unknown[]; omittedItemCount: number } {
  const candidate = value as { count?: unknown; items?: unknown; omittedItemCount?: unknown };
  return typeof candidate.count === "number" && Array.isArray(candidate.items) && typeof candidate.omittedItemCount === "number";
}

function isSanitizedObjectSummary(value: object): value is { fields: Record<string, unknown>; omittedFieldCount: number } {
  const candidate = value as { fields?: unknown; omittedFieldCount?: unknown };
  return Boolean(candidate.fields && typeof candidate.fields === "object" && !Array.isArray(candidate.fields) && typeof candidate.omittedFieldCount === "number");
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function isPreviewRecordStatus(value: unknown): value is PreviewRecordStatus {
  return value === "active" || value === "expired" || value === "invalid";
}

function isExpired(record: StoredPreviewRecord, now: Date): boolean {
  return new Date(record.expiresAt).getTime() <= now.getTime();
}

function missingPreview(): PreviewStoreLookupResult {
  return {
    ok: false,
    status: "missing",
    diagnostic: diagnostic("stored_preview_missing", "Stored preview was not found; execute binding fails closed.")
  };
}

function expiredPreview(record: StoredPreviewRecord): PreviewStoreLookupResult {
  return {
    ok: false,
    status: "expired",
    record: safeRecord(record),
    diagnostic: diagnostic("stored_preview_expired", "Stored preview is expired; execute binding fails closed.")
  };
}

function invalidPreview(record: StoredPreviewRecord): PreviewStoreLookupResult {
  return {
    ok: false,
    status: "invalid",
    record: safeRecord(record),
    diagnostic: diagnostic("stored_preview_invalid", "Stored preview is invalid; execute binding fails closed.")
  };
}

function diagnostic(code: string, message: string): ExecutePreviewBindingDiagnostic {
  return { code, message };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (isSecretKey(key) || looksLikeSecret(paramValue)) url.searchParams.set(key, redacted);
    }
    return truncate(url.toString(), maxStringLength);
  } catch {
    return safeString(value) ?? redacted;
  }
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSecretKey(key: string): boolean {
  return /token|secret|password|authorization|access[_-]?token|accessToken|api[_-]?key|client[_-]?secret|key/i.test(key);
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}
