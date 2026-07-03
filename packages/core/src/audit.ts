export interface AuditEntry {
  timestamp: string;
  tool: string;
  target: string;
  mode: "preview" | "execute" | "read";
  summary: string;
  result: "success" | "blocked" | "failed" | "not_implemented";
}

export class MemoryAuditLog {
  private readonly entries: AuditEntry[] = [];

  record(entry: Omit<AuditEntry, "timestamp">): AuditEntry {
    const fullEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.entries.push(fullEntry);
    return fullEntry;
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }
}
