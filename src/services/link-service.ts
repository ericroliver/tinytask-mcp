/**
 * Link service - Business logic for link/artifact operations
 */

import { DatabaseClient } from '../db/client.js';
import { Link, CreateLinkParams, UpdateLinkParams, LinkData, Task } from '../types/index.js';
import { toISO8601 } from '../utils/timestamp.js';
import { EventBus } from '../events/event-bus.js';
import { TaskEventType, createEvent } from '../events/event-types.js';
import type { TaskContext } from '../events/event-types.js';

export class LinkService {
  constructor(
    private db: DatabaseClient,
    private eventBus?: EventBus
  ) {}

  /**
   * Emit an event to the EventBus (no-op if EventBus not configured)
   */
  private emit(type: TaskEventType, payload: Record<string, unknown>): void {
    if (!this.eventBus) return;
    this.eventBus.emit(createEvent(type, payload));
  }

  /**
   * Fetch core task context fields (assignee, owner, status, cue) by task ID.
   * Returns null if the task doesn't exist.
   */
  private getTaskContext(taskId: number): TaskContext | null {
    const task = this.db.queryOne<Task>(
      'SELECT assigned_to, created_by, status, queue_name FROM tasks WHERE id = ?',
      [taskId]
    );
    if (!task) return null;
    return {
      assignee: task.assigned_to,
      owner: task.created_by,
      status: task.status as TaskContext['status'],
      cue: task.queue_name,
    };
  }

  /**
   * Parse link from database row (convert timestamps to ISO 8601)
   */
  private parseLink(link: Link): LinkData {
    return {
      ...link,
      created_at: toISO8601(link.created_at),
    };
  }

  /**
   * Create a new link
   */
  create(params: CreateLinkParams): LinkData {
    // Use a transaction to ensure atomic execution and immediate lock release
    const link = this.db.transaction(() => {
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

      const created = this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [
        result.lastInsertRowid,
      ]);

      if (!created) {
        throw new Error('Failed to retrieve created link');
      }

      return this.parseLink(created);
    });

    this.emit(TaskEventType.LinkAdded, {
      taskId: params.task_id,
      link,
      ...(this.getTaskContext(params.task_id) ?? {}),
    });
    return link;
  }

  /**
   * Get link by ID
   */
  get(id: number): LinkData | null {
    const link = this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [id]);
    return link ? this.parseLink(link) : null;
  }

  /**
   * Update link fields
   */
  update(id: number, updates: UpdateLinkParams): LinkData {
    // Capture before state for events (read outside transaction — safe, just a SELECT)
    const beforeLink = this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [id]);
    if (!beforeLink) {
      throw new Error(`Link not found: ${id}`);
    }

    // Use a transaction to ensure atomic execution and immediate lock release
    const updated = this.db.transaction(() => {
      // Re-check inside transaction for atomicity
      const existing = this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [id]);
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
        return this.parseLink(existing);
      }

      values.push(id);

      this.db.execute(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`, values);

      const updatedLink = this.db.queryOne<Link>('SELECT * FROM links WHERE id = ?', [id]);
      if (!updatedLink) {
        throw new Error('Failed to retrieve updated link');
      }

      return this.parseLink(updatedLink);
    });

    if (beforeLink) {
      const hasUpdates = updates.url !== undefined || updates.description !== undefined;
      if (hasUpdates) {
        const before: Partial<LinkData> = this.parseLink(beforeLink);
        this.emit(TaskEventType.LinkUpdated, {
          taskId: beforeLink.task_id,
          linkId: id,
          before,
          after: updated,
          ...(this.getTaskContext(beforeLink.task_id) ?? {}),
        });
      }
    }
    return updated;
  }

  /**
   * Delete link permanently
   */
  delete(id: number): void {
    // Capture task_id before deletion for event emission
    const link = this.db.queryOne<Link>('SELECT task_id FROM links WHERE id = ?', [id]);
    if (!link) {
      throw new Error(`Link not found: ${id}`);
    }

    const result = this.db.execute('DELETE FROM links WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Link not found: ${id}`);
    }

    this.emit(TaskEventType.LinkDeleted, {
      taskId: link.task_id,
      linkId: id,
      ...(this.getTaskContext(link.task_id) ?? {}),
    });
  }

  /**
   * List all links for a task
   */
  listByTask(taskId: number): LinkData[] {
    const links = this.db.query<Link>(
      'SELECT * FROM links WHERE task_id = ? ORDER BY created_at ASC',
      [taskId]
    );
    return links.map((l) => this.parseLink(l));
  }
}
