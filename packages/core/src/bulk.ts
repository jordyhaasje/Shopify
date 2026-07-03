export interface BulkChange<T> {
  id: string;
  before: T;
  after: T;
}

export interface BulkPreview<T> {
  count: number;
  changes: Array<BulkChange<T>>;
  summary: string;
}

export function createBulkPreview<T>(changes: Array<BulkChange<T>>): BulkPreview<T> {
  return {
    count: changes.length,
    changes,
    summary: `${changes.length} change${changes.length === 1 ? "" : "s"} ready for review.`
  };
}
