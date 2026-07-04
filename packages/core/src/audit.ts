export interface AuditEntry {
  timestamp: string;
  tool: string;
  target: string;
  mode: "preview" | "execute" | "read";
  summary: string;
  result: "success" | "blocked" | "failed" | "not_implemented";
}

export interface AuditLog {
  record(entry: Omit<AuditEntry, "timestamp">): AuditEntry;
  list(): AuditEntry[];
}

export class MemoryAuditLog implements AuditLog {
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
