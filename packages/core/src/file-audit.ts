import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AuditEntry, AuditLog } from "./audit.js";

export function defaultAuditLogPath(home = homedir()): string {
  return join(home, ".shopify-store-agent", "audit.jsonl");
}

export interface FileAuditLogOptions {
  path?: string;
  now?: () => Date;
}

export class FileAuditLog implements AuditLog {
  private readonly path: string;
  private readonly now: () => Date;

  constructor(options: FileAuditLogOptions | string = {}) {
    this.path = typeof options === "string" ? options : options.path ?? defaultAuditLogPath();
    this.now = typeof options === "string" ? () => new Date() : options.now ?? (() => new Date());
  }

  record(entry: Omit<AuditEntry, "timestamp">): AuditEntry {
    const fullEntry = {
      timestamp: this.now().toISOString(),
      ...entry
    };
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    appendFileSync(this.path, `${JSON.stringify(fullEntry)}\n`, { mode: 0o600 });
    return fullEntry;
  }

  list(): AuditEntry[] {
    try {
      const raw = readFileSync(this.path, "utf8");
      return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditEntry);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }
}
