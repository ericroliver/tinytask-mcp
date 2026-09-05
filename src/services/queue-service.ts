/**
 * Queue service - Business logic for queue operations
 */

import { DatabaseClient } from '../db/client.js';
import { Task, ParsedTask, QueueStats, TaskFilters } from '../types/index.js';
import { toISO8601 } from '../utils/timestamp.js';
import { EventBus } from '../events/event-bus.js';
import { TaskEventType, createEvent, extractTaskContext } from '../events/event-types.js';

export class QueueService {
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
   * Get list of all unique queue names currently in use
   */
  listQueues(): string[] {
    const rows = this.db.query<{ queue_name: string }>(
      `SELECT DISTINCT queue_name 
       FROM tasks 
       WHERE queue_name IS NOT NULL 
         AND archived_at IS NULL
       ORDER BY queue_name ASC`
    );

    return rows.map((row) => row.queue_name);
  }

  /**
   * Get statistics for a specific queue
   */
  getQueueStats(queueName: string): QueueStats {
    // Validate queue name
    const trimmedQueueName = queueName.trim();
    if (trimmedQueueName.length === 0) {
      throw new Error('Queue name cannot be empty');
    }

    // Get aggregated statistics
    const stats = this.db.queryOne<{
      total: number | null;
      idle: number | null;
      working: number | null;
      complete: number | null;
      unassigned: number | null;
      assigned: number | null;
    }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
         SUM(CASE WHEN status = 'working' THEN 1 ELSE 0 END) as working,
         SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as complete,
         SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) as unassigned,
         SUM(CASE WHEN assigned_to IS NOT NULL THEN 1 ELSE 0 END) as assigned
       FROM tasks
       WHERE queue_name = ?
         AND archived_at IS NULL`,
      [trimmedQueueName]
    );

    // Get list of unique agents in the queue
    const agentRows = this.db.query<{ assigned_to: string }>(
      `SELECT DISTINCT assigned_to
       FROM tasks
       WHERE queue_name = ?
         AND assigned_to IS NOT NULL
         AND archived_at IS NULL
       ORDER BY assigned_to ASC`,
      [trimmedQueueName]
    );

    const agents = agentRows.map((row) => row.assigned_to);

    // Return stats with proper defaults for non-existent queues
    return {
      queue_name: trimmedQueueName,
      total_tasks: stats?.total ?? 0,
      by_status: {
        idle: stats?.idle ?? 0,
        working: stats?.working ?? 0,
        complete: stats?.complete ?? 0,
      },
      assigned: stats?.assigned ?? 0,
      unassigned: stats?.unassigned ?? 0,
      agents,
    };
  }

  /**
   * Add an existing task to a queue
   */
  addTaskToQueue(taskId: number, queueName: string): ParsedTask {
    const task = this.db.transaction(() => {
      // Validate queue name
      const trimmedQueueName = queueName.trim();
      if (trimmedQueueName.length === 0) {
        throw new Error('Queue name cannot be empty');
      }

      if (trimmedQueueName.length > 255) {
        throw new Error('Queue name is too long (max 255 characters)');
      }

      // Verify task exists
      const taskRow = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Update task queue
      this.db.execute(
        'UPDATE tasks SET queue_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [trimmedQueueName, taskId]
      );

      // Return updated task
      const updated = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!updated) {
        throw new Error('Failed to retrieve updated task');
      }

      return this.parseTask(updated);
    });

    this.emit(TaskEventType.TaskAddedToQueue, { taskId, queueName: queueName.trim(), ...extractTaskContext(task) });
    return task;
  }

  /**
   * Remove task from its queue (set queue_name to null)
   */
  removeTaskFromQueue(taskId: number): ParsedTask {
    let oldQueueName: string | null = null;
    const task = this.db.transaction(() => {
      // Verify task exists
      const taskRow = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }
      oldQueueName = taskRow.queue_name;

      // Update task queue to null
      this.db.execute(
        'UPDATE tasks SET queue_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [taskId]
      );

      // Return updated task
      const updated = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!updated) {
        throw new Error('Failed to retrieve updated task');
      }

      return this.parseTask(updated);
    });

    this.emit(TaskEventType.TaskRemovedFromQueue, { taskId, queueName: oldQueueName, ...extractTaskContext(task) });
    return task;
  }

  /**
   * Move task from one queue to another
   */
  moveTaskToQueue(taskId: number, newQueueName: string): ParsedTask {
    let oldQueueName: string | null = null;
    const task = this.db.transaction(() => {
      // Validate queue name
      const trimmedQueueName = newQueueName.trim();
      if (trimmedQueueName.length === 0) {
        throw new Error('Queue name cannot be empty');
      }

      if (trimmedQueueName.length > 255) {
        throw new Error('Queue name is too long (max 255 characters)');
      }

      // Verify task exists
      const taskRow = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }
      oldQueueName = taskRow.queue_name;

      // Update task queue
      this.db.execute(
        'UPDATE tasks SET queue_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [trimmedQueueName, taskId]
      );

      // Return updated task
      const updated = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
      if (!updated) {
        throw new Error('Failed to retrieve updated task');
      }

      return this.parseTask(updated);
    });

    this.emit(TaskEventType.TaskQueueChanged, {
      taskId,
      before: oldQueueName,
      after: newQueueName.trim(),
      ...extractTaskContext(task),
    });
    return task;
  }

  /**
   * Get all tasks in a queue with optional filters
   */
  getQueueTasks(queueName: string, filters: TaskFilters = {}): ParsedTask[] {
    // Validate queue name
    const trimmedQueueName = queueName.trim();
    if (trimmedQueueName.length === 0) {
      throw new Error('Queue name cannot be empty');
    }

    const conditions: string[] = ['queue_name = ?'];
    const values: unknown[] = [trimmedQueueName];

    // Add optional filters
    if (filters.assigned_to !== undefined) {
      conditions.push('assigned_to = ?');
      values.push(filters.assigned_to);
    }

    if (filters.status !== undefined) {
      if (Array.isArray(filters.status)) {
        if (filters.status.length > 0) {
          const placeholders = filters.status.map(() => '?').join(', ');
          conditions.push(`status IN (${placeholders})`);
          values.push(...filters.status);
        }
      } else {
        conditions.push('status = ?');
        values.push(filters.status);
      }
    }

    if (filters.exclude_status !== undefined && filters.exclude_status.length > 0) {
      const placeholders = filters.exclude_status.map(() => '?').join(', ');
      conditions.push(`status NOT IN (${placeholders})`);
      values.push(...filters.exclude_status);
    }

    if (filters.parent_task_id !== undefined) {
      if (filters.parent_task_id === null) {
        conditions.push('parent_task_id IS NULL');
      } else {
        conditions.push('parent_task_id = ?');
        values.push(filters.parent_task_id);
      }
    }

    if (filters.exclude_subtasks) {
      conditions.push('parent_task_id IS NULL');
    }

    if (!filters.include_archived) {
      conditions.push('archived_at IS NULL');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    // SQLite requires LIMIT before OFFSET. Use LIMIT -1 to mean "no limit" when only offset is provided.
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : filters.offset ? 'LIMIT -1' : '';
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : '';

    const sql = `
      SELECT * FROM tasks
      ${whereClause}
      ORDER BY priority DESC, created_at ASC
      ${limitClause} ${offsetClause}
    `;

    const tasks = this.db.query<Task>(sql, values);
    return tasks.map((task) => this.parseTask(task));
  }

  /**
   * Remove all tasks from a queue (returns count of tasks cleared)
   */
  clearQueue(queueName: string): number {
    const count = this.db.transaction(() => {
      // Validate queue name
      const trimmedQueueName = queueName.trim();
      if (trimmedQueueName.length === 0) {
        throw new Error('Queue name cannot be empty');
      }

      // Update all tasks in the queue to have null queue_name
      const result = this.db.execute(
        'UPDATE tasks SET queue_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE queue_name = ? AND archived_at IS NULL',
        [trimmedQueueName]
      );

      return result.changes;
    });

    this.emit(TaskEventType.QueueCleared, { queueName: queueName.trim(), count });
    return count;
  }

  /**
   * Check if a task is currently blocked
   */
  private isCurrentlyBlocked(task: Task): boolean {
    if (!task.blocked_by_task_id) {
      return false;
    }

    const blockingTask = this.db.queryOne<Task>('SELECT id, status FROM tasks WHERE id = ?', [
      task.blocked_by_task_id,
    ]);

    if (!blockingTask) {
      return false;
    }

    return blockingTask.status !== 'complete';
  }

  /**
   * Parse task from database row (handle JSON tags and compute blocking state)
   */
  private parseTask(task: Task): ParsedTask {
    return {
      ...task,
      tags: task.tags ? JSON.parse(task.tags as string) : [],
      is_currently_blocked: this.isCurrentlyBlocked(task),
      auto_promote: task.auto_promote !== 0,
      created_at: toISO8601(task.created_at),
      updated_at: toISO8601(task.updated_at),
      archived_at: task.archived_at ? toISO8601(task.archived_at) : null,
    };
  }
}
