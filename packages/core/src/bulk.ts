export interface BulkChange<T> {
  id: string;
  before: T;
  after: T;
}

export interface BulkValueSummary {
  type: "null" | "string" | "number" | "boolean" | "array" | "object" | "unknown";
  value?: number | boolean;
  length?: number;
  itemCount?: number;
  keys?: string[];
  fields?: Record<string, BulkValueSummary>;
  items?: BulkValueSummary[];
  redacted?: boolean;
  truncated?: boolean;
}

export interface BulkPreviewChange {
  id: string;
  sourceId?: BulkValueSummary;
  before: BulkValueSummary;
  after: BulkValueSummary;
  changedKeys: string[];
}

export interface BulkPreviewWarning {
  code: string;
  message: string;
}

export interface BulkPreview {
  count: number;
  includedChanges: number;
  changes: BulkPreviewChange[];
  summary: string;
  warnings: BulkPreviewWarning[];
}

const maxChanges = 50;
const maxDepth = 2;
const maxObjectFields = 12;
const maxArrayItems = 5;
const maxIdentifierLength = 80;
const redacted = "[redacted]";
const secretKeyPattern = /(?:token|secret|password|authorization|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|cookie|session)/i;
const secretValuePattern = /(?:shpat_|shpua_|shpss_|Bearer\s+|client_secret=|access_token=|refresh_token=|password=)/i;

export function createBulkPreview<T>(changes: Array<BulkChange<T>>): BulkPreview {
  const included = changes.slice(0, maxChanges).map((change, index) => ({
    id: safeChangeId(change.id, index),
    sourceId: summarizeBulkValue(change.id),
    before: summarizeBulkValue(change.before),
    after: summarizeBulkValue(change.after),
    changedKeys: changedKeys(change.before, change.after)
  }));
  const warnings: BulkPreviewWarning[] = [
    {
      code: "safe_summary_only",
      message: "Bulk preview returns summarized values only; raw before/after payloads are not returned."
    }
  ];
  if (changes.length > maxChanges) {
    warnings.push({
      code: "changes_truncated",
      message: `Only the first ${maxChanges} changes are included in the preview output.`
    });
  }

  return {
    count: changes.length,
    includedChanges: included.length,
    changes: included,
    summary: `${changes.length} change${changes.length === 1 ? "" : "s"} ready for review.`,
    warnings
  };
}

export function summarizeBulkValue(value: unknown, key?: string, depth = 0): BulkValueSummary {
  if (key && secretKeyPattern.test(key)) return { type: "unknown", redacted: true };
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "string") {
    return {
      type: "string",
      length: value.length,
      redacted: secretValuePattern.test(value)
    };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { type: "number", value } : { type: "unknown" };
  }
  if (typeof value === "boolean") return { type: "boolean", value };
  if (Array.isArray(value)) {
    const includeItems = depth < maxDepth ? value.slice(0, maxArrayItems).map((item) => summarizeBulkValue(item, undefined, depth + 1)) : undefined;
    return {
      type: "array",
      itemCount: value.length,
      items: includeItems,
      truncated: value.length > maxArrayItems || depth >= maxDepth
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, maxObjectFields);
    const fields = depth < maxDepth
      ? Object.fromEntries(entries.map(([field, fieldValue]) => [safeFieldName(field), summarizeBulkValue(fieldValue, field, depth + 1)]))
      : undefined;
    return {
      type: "object",
      keys: entries.map(([field]) => safeFieldName(field)),
      fields,
      truncated: Object.keys(value as Record<string, unknown>).length > maxObjectFields || depth >= maxDepth
    };
  }
  return { type: "unknown" };
}

function safeChangeId(id: unknown, index: number): string {
  if (typeof id !== "string" || !id.trim() || secretValuePattern.test(id)) return `change-${index + 1}`;
  return id.trim().slice(0, maxIdentifierLength);
}

function safeFieldName(field: string): string {
  return secretKeyPattern.test(field) ? redacted : field.slice(0, maxIdentifierLength);
}

function changedKeys(before: unknown, after: unknown): string[] {
  if (!isPlainObject(before) || !isPlainObject(after)) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys)
    .filter((key) => !secretKeyPattern.test(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, maxObjectFields)
    .map(safeFieldName);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
