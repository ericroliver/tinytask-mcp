/**
 * Task service - Business logic for task operations
 */

import { DatabaseClient } from '../db/client.js';
import {
  Task,
  ParsedTask,
  TaskWithRelations,
  CreateTaskParams,
  UpdateTaskParams,
  TaskFilters,
  TaskStatus,
  CommentData,
  LinkData,
} from '../types/index.js';

export class TaskService {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new task
   */
  create(params: CreateTaskParams): ParsedTask {
    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
      // Validate required fields
      if (!params.title || params.title.trim().length === 0) {
        throw new Error('Task title is required');
      }

      // Validate status if provided
      if (params.status && !this.isValidStatus(params.status)) {
        throw new Error(`Invalid status: ${params.status}`);
      }

      // Prepare data
      const status = params.status || 'idle';
      const priority = params.priority ?? 0;
      const tags = params.tags ? JSON.stringify(params.tags) : null;

      const result = this.db.execute(
        `INSERT INTO tasks (title, description, status, assigned_to, created_by, priority, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          params.title.trim(),
          params.description || null,
          status,
          params.assigned_to || null,
          params.created_by || null,
          priority,
          tags,
        ]
      );

      const task = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [
        result.lastInsertRowid,
      ]);

      if (!task) {
        throw new Error('Failed to retrieve created task');
      }

      return this.parseTask(task);
    });
  }

  /**
   * Get task by ID
   */
  get(id: number, includeRelations = false): TaskWithRelations | null {
    const task = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

    if (!task) {
      return null;
    }

    const parsedTask = this.parseTask(task);

    if (!includeRelations) {
      return parsedTask as TaskWithRelations;
    }

    // Include comments and links
    const comments = this.db.query<CommentData>(
      'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC',
      [id]
    );
    const links = this.db.query<LinkData>(
      'SELECT * FROM links WHERE task_id = ? ORDER BY created_at ASC',
      [id]
    );

    return {
      ...parsedTask,
      comments,
      links,
    };
  }

  /**
   * Update task fields
   */
  update(id: number, updates: UpdateTaskParams): ParsedTask {
    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
      // Check if task exists
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Task not found: ${id}`);
      }

      // Validate status if provided
      if (updates.status && !this.isValidStatus(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}`);
      }

      // Build update query dynamically
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.title !== undefined) {
        if (!updates.title || updates.title.trim().length === 0) {
          throw new Error('Task title cannot be empty');
        }
        fields.push('title = ?');
        values.push(updates.title.trim());
      }

      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description || null);
      }

      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      if (updates.assigned_to !== undefined) {
        fields.push('assigned_to = ?');
        values.push(updates.assigned_to || null);
      }

      if (updates.priority !== undefined) {
        fields.push('priority = ?');
        values.push(updates.priority);
      }

      if (updates.tags !== undefined) {
        fields.push('tags = ?');
        values.push(JSON.stringify(updates.tags));
      }

      // Always update updated_at
      fields.push('updated_at = CURRENT_TIMESTAMP');

      if (fields.length === 1) {
        // Only updated_at would be updated, no actual changes
        return existing;
      }

      values.push(id);

      this.db.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);

      const updated = this.get(id);
      if (!updated) {
        throw new Error('Failed to retrieve updated task');
      }

      return updated;
    });
  }

  /**
   * Delete task permanently
   */
  delete(id: number): void {
    const result = this.db.execute('DELETE FROM tasks WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Task not found: ${id}`);
    }
  }

  /**
   * List tasks with optional filters
   */
  list(filters: TaskFilters = {}): ParsedTask[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.assigned_to !== undefined) {
      conditions.push('assigned_to = ?');
      values.push(filters.assigned_to);
    }

    if (filters.status !== undefined) {
      conditions.push('status = ?');
      values.push(filters.status);
    }

    if (!filters.include_archived) {
      conditions.push('archived_at IS NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : '';
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : '';

    const sql = `
      SELECT * FROM tasks
      ${whereClause}
      ORDER BY priority DESC, created_at ASC
      ${limitClause} ${offsetClause}
    `;

    const tasks = this.db.query<Task>(sql, values);
    return tasks.map(this.parseTask);
  }

  /**
   * Get agent's task queue (assigned open tasks)
   */
  getQueue(agentName: string): ParsedTask[] {
    const tasks = this.db.query<Task>(
      `SELECT * FROM tasks 
       WHERE assigned_to = ? 
         AND status IN ('idle', 'working')
         AND archived_at IS NULL
       ORDER BY priority DESC, created_at ASC`,
      [agentName]
    );

    return tasks.map(this.parseTask);
  }

  /**
   * Archive a task (soft delete)
   */
  archive(id: number): ParsedTask {
    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Task not found: ${id}`);
      }

      this.db.execute('UPDATE tasks SET archived_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

      const archived = this.get(id);
      if (!archived) {
        throw new Error('Failed to retrieve archived task');
      }

      return archived;
    });
  }

  /**
   * Validate status value
   */
  private isValidStatus(status: string): status is TaskStatus {
    return ['idle', 'working', 'complete'].includes(status);
  }

  /**
   * Parse task from database row (handle JSON tags)
   */
  private parseTask(task: Task): ParsedTask {
    return {
      ...task,
      tags: task.tags ? JSON.parse(task.tags as string) : [],
    };
  }
}
