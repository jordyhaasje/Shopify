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
  const previewId = normalizeBindingString(input.previewId);
  const expectedTool = normalizeBindingString(input.expectedTool);
  const target = normalizeBindingString(input.target);
  const previewHash = normalizeBindingString(input.previewHash);
  const reviewedChangesHash = normalizeBindingString(input.reviewedChangesHash);

  if (!previewId) diagnostics.push(diagnostic("missing_preview_id", "Execute requires a previewId from a reviewed preview."));
  if (previewId && looksLikeSecret(previewId)) diagnostics.push(diagnostic("invalid_secret_like_preview_id", "Execute previewId must be a non-secret preview reference."));
  if (input.confirmed !== true) diagnostics.push(diagnostic("missing_confirmation", "Execute requires explicit confirmation after preview review."));
  if (!isReviewedPayload(input.reviewedPayload)) diagnostics.push(diagnostic("missing_reviewed_payload", "Execute requires a reviewedPayload bound to the preview."));
  if (!expectedTool) diagnostics.push(diagnostic("missing_expected_tool", "Execute requires the reviewed preview tool name."));
  if (expectedTool && expectedTool !== context.expectedPreviewTool) diagnostics.push(diagnostic("preview_tool_mismatch", "Execute preview binding expectedTool does not match this execute tool."));
  if (!target) diagnostics.push(diagnostic("missing_target", "Execute requires the reviewed preview target."));
  if (target && target !== context.target) diagnostics.push(diagnostic("target_mismatch", "Execute preview binding target does not match this execute target."));
  if (!previewHash) diagnostics.push(diagnostic("missing_preview_hash", "Execute requires the reviewed preview hash."));
  if (previewHash && looksLikeSecret(previewHash)) diagnostics.push(diagnostic("invalid_secret_like_hash", "Execute binding hashes must be non-secret review hashes."));
  if (!reviewedChangesHash) diagnostics.push(diagnostic("missing_reviewed_changes_hash", "Execute requires the reviewed changes hash."));
  if (reviewedChangesHash && looksLikeSecret(reviewedChangesHash)) diagnostics.push(diagnostic("invalid_secret_like_hash", "Execute binding hashes must be non-secret review hashes."));
  if (previewHash && reviewedChangesHash && previewHash !== reviewedChangesHash) diagnostics.push(diagnostic("preview_hash_mismatch", "Execute preview binding hash does not match the reviewed changes hash."));

  return {
    ok: diagnostics.length === 0,
    previewId: safeString(input.previewId),
    expectedPreviewTool: context.expectedPreviewTool,
    target: safeString(context.target) ?? context.target,
    diagnostics
  };
}

function isReviewedPayload(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function diagnostic(code: string, message: string): ExecutePreviewBindingDiagnostic {
  return { code, message };
}

function normalizeBindingString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim();
  return normalized.length > maxScalarLength ? `${normalized.slice(0, maxScalarLength)}...` : normalized;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (looksLikeSecret(value)) return redacted;
  return normalizeBindingString(value);
}

function looksLikeSecret(value: string): boolean {
  return /shpat_[A-Za-z0-9_]+|shpua_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+/i.test(value);
}
