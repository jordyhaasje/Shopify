import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileAuditLog } from "../src/file-audit.js";

describe("file audit log", () => {
  it("appends and reloads safe audit entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "ssa-audit-"));
    try {
      const audit = new FileAuditLog({
        path: join(dir, "audit.jsonl"),
        now: () => new Date("2026-07-04T12:00:00.000Z")
      });

      const recorded = audit.record({
        tool: "product.create.preview",
        target: "Test Product",
        mode: "preview",
        summary: "Product preview generated.",
        result: "success"
      });

      expect(recorded).toEqual({
        timestamp: "2026-07-04T12:00:00.000Z",
        tool: "product.create.preview",
        target: "Test Product",
        mode: "preview",
        summary: "Product preview generated.",
        result: "success"
      });

      const reloaded = new FileAuditLog(join(dir, "audit.jsonl"));
      expect(reloaded.list()).toEqual([recorded]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
