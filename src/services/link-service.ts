/**
 * Link service - Business logic for link/artifact operations
 */

import { DatabaseClient } from '../db/client.js';
import { Link, CreateLinkParams, UpdateLinkParams } from '../types/index.js';

export class LinkService {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new link
   */
  create(params: CreateLinkParams): Link {
    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
      // Validate required fields
      if (!params.url || params.url.trim().length === 0) {
        throw new Error('Link URL is required');
      }

      // Verify task exists
      const task = this.db.queryOne('SELECT id FROM tasks WHERE id = ?', [params.task_id]);
      if (!task) {
        throw new Error(`Task not found: ${params.task_id}`);
      }

      const result = this.db.execute(
        `INSERT INTO links (task_id, url, description, created_by)
         VALUES (?, ?, ?, ?)`,
        [params.task_id, params.url.trim(), params.description || null, params.created_by || null]
      );

      const link = this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [
        result.lastInsertRowid,
      ]);

      if (!link) {
        throw new Error('Failed to retrieve created link');
      }

      return link;
    });
  }

  /**
   * Get link by ID
   */
  get(id: number): Link | null {
    return this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [id]);
  }

  /**
   * Update link fields
   */
  update(id: number, updates: UpdateLinkParams): Link {
    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
      // Check if link exists
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Link not found: ${id}`);
      }

      // Build update query dynamically
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.url !== undefined) {
        if (!updates.url || updates.url.trim().length === 0) {
          throw new Error('Link URL cannot be empty');
        }
        fields.push('url = ?');
        values.push(updates.url.trim());
      }

      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description || null);
      }

      if (fields.length === 0) {
        // No actual changes
        return existing;
      }

      values.push(id);

      this.db.execute(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`, values);

      const updated = this.get(id);
      if (!updated) {
        throw new Error('Failed to retrieve updated link');
      }

      return updated;
    });
  }

  /**
   * Delete link permanently
   */
  delete(id: number): void {
    const result = this.db.execute('DELETE FROM links WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Link not found: ${id}`);
    }
  }

  /**
   * List all links for a task
   */
  listByTask(taskId: number): Link[] {
    return this.db.query<Link>('SELECT * FROM links WHERE task_id = ? ORDER BY created_at ASC', [
      taskId,
    ]);
  }
}
