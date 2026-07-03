export interface ExecutePreviewBindingInput {
  previewId?: unknown;
  confirmed?: unknown;
  reviewedPayload?: unknown;
  expectedTool?: unknown;
  target?: unknown;
  previewHash?: unknown;
  reviewedChangesHash?: unknown;
}

export interface ExecutePreviewBindingContext {
  executeTool: string;
  expectedPreviewTool: string;
  target: string;
}

export interface ExecutePreviewBindingDiagnostic {
  code: string;
  message: string;
}

export interface ExecutePreviewBindingResult {
  ok: boolean;
  previewId?: string;
  expectedPreviewTool: string;
  target: string;
  diagnostics: ExecutePreviewBindingDiagnostic[];
}

const redacted = "[redacted]";
const maxScalarLength = 180;

export function validateExecutePreviewBinding(
  input: ExecutePreviewBindingInput,
  context: ExecutePreviewBindingContext
): ExecutePreviewBindingResult {
  const diagnostics: ExecutePreviewBindingDiagnostic[] = [];
  const previewId = safeString(input.previewId);
  const expectedTool = safeString(input.expectedTool);
  const target = safeString(input.target);
  const previewHash = safeString(input.previewHash);
  const reviewedChangesHash = safeString(input.reviewedChangesHash);

  if (!previewId) diagnostics.push(diagnostic("missing_preview_id", "Execute requires a previewId from a reviewed preview."));
  if (input.confirmed !== true) diagnostics.push(diagnostic("missing_confirmation", "Execute requires explicit confirmation after preview review."));
  if (!isReviewedPayload(input.reviewedPayload)) diagnostics.push(diagnostic("missing_reviewed_payload", "Execute requires a reviewedPayload bound to the preview."));
  if (expectedTool && expectedTool !== context.expectedPreviewTool) diagnostics.push(diagnostic("preview_tool_mismatch", "Execute preview binding expectedTool does not match this execute tool."));
  if (target && target !== context.target) diagnostics.push(diagnostic("target_mismatch", "Execute preview binding target does not match this execute target."));
  if (previewHash && reviewedChangesHash && previewHash !== reviewedChangesHash) diagnostics.push(diagnostic("preview_hash_mismatch", "Execute preview binding hash does not match the reviewed changes hash."));

  return {
    ok: diagnostics.length === 0,
    previewId,
    expectedPreviewTool: context.expectedPreviewTool,
    target: context.target,
    diagnostics
  };
}

function isReviewedPayload(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function diagnostic(code: string, message: string): ExecutePreviewBindingDiagnostic {
  return { code, message };
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return redacted;
  const normalized = value.trim();
  return normalized.length > maxScalarLength ? `${normalized.slice(0, maxScalarLength)}...` : normalized;
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}
