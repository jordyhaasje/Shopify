import { mkdir, appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AuditEntry } from "./audit.js";

export function defaultAuditLogPath(home = homedir()): string {
  return join(home, ".shopify-store-agent", "audit.jsonl");
}

export class FileAuditLog {
  constructor(private readonly path = defaultAuditLogPath()) {}

  async record(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }

  async list(): Promise<AuditEntry[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditEntry);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }
}
