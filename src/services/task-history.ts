/**
 * Task history recording — shared helper for services that mutate tasks.
 *
 * Populates the `task_history` table (see src/db/schema.sql) so agents get the
 * documented audit trail: an immutable log of every task change (status, queue,
 * assignee, fields) with timestamp and actor.
 */
import { DatabaseClient } from '../db/client.js';
import { TaskHistory } from '../types/database.js';
import { toISO8601 } from '../utils/timestamp.js';

export interface HistoryChange {
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

/**
 * Record a batch of field changes for a task. No-op for an empty change list.
 * Callers must invoke this inside the same transaction as the mutation itself
 * so history stays atomic with the change it describes.
 */
export function recordTaskHistory(
  db: DatabaseClient,
  taskId: number,
  changes: HistoryChange[],
  changedBy: string | null
): void {
  if (changes.length === 0) {
    return;
  }
  const insert =
    'INSERT INTO task_history (task_id, field_name, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)';
  for (const change of changes) {
    db.execute(insert, [taskId, change.field_name, change.old_value, change.new_value, changedBy]);
  }
}

/**
 * Read the full history for a task, oldest first (chronological timeline).
 * Timestamps are returned as ISO 8601 strings, matching ParsedTask conventions.
 */
export function getTaskHistory(db: DatabaseClient, taskId: number): TaskHistory[] {
  const rows = db.query<TaskHistory>(
    `SELECT id, task_id, field_name, old_value, new_value, changed_by, changed_at
     FROM task_history
     WHERE task_id = ?
     ORDER BY changed_at ASC, id ASC`,
    [taskId]
  );
  return rows.map((row) => ({ ...row, changed_at: toISO8601(row.changed_at) }));
}
