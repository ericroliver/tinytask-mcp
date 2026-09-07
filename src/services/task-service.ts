/**
 * Task service - Business logic for task operations
 */

import { DatabaseClient } from '../db/client.js';
import {
  Task,
  ParsedTask,
  TaskWithRelations,
  TaskWithSubtasks,
  CreateTaskParams,
  UpdateTaskParams,
  TaskFilters,
  TaskStatus,
  Comment,
  CommentData,
  Link,
  TaskHistory,
} from '../types/index.js';
import { toISO8601 } from '../utils/timestamp.js';
import { recordTaskHistory, getTaskHistory, HistoryChange } from './task-history.js';
import { EventBus } from '../events/event-bus.js';
import { TaskEventType, createEvent, extractTaskContext } from '../events/event-types.js';
import type { TaskContext } from '../events/event-types.js';

export class TaskService {
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
   * Create a new task
   */
  create(params: CreateTaskParams): ParsedTask {
    // Use a transaction to ensure atomic execution and immediate lock release
    const task = this.db.transaction(() => {
      // Validate required fields
      if (!params.title || params.title.trim().length === 0) {
        throw new Error('Task title is required');
      }

      // created_by is required for the stimuli system to work properly
      if (!params.created_by || params.created_by.trim().length === 0) {
        throw new Error('created_by is required');
      }

      // Validate status if provided
      if (params.status && !this.isValidStatus(params.status)) {
        throw new Error(`Invalid status: ${params.status}`);
      }

      // Validate parent_task_id if provided
      let parentQueueName: string | null = null;
      if (params.parent_task_id !== undefined && params.parent_task_id !== null) {
        const parent = this.get(params.parent_task_id);
        if (!parent) {
          throw new Error(`Parent task not found: ${params.parent_task_id}`);
        }
        // Inherit queue_name from parent if not explicitly provided
        parentQueueName = parent.queue_name;

        // Validate nesting depth (max 3 levels)
        const depth = this.getTaskDepth(params.parent_task_id);
        if (depth >= 3) {
          throw new Error('Maximum nesting depth (3 levels) exceeded');
        }
      }

      // Validate blocked_by_task_id if provided
      if (params.blocked_by_task_id !== undefined && params.blocked_by_task_id !== null) {
        const blockingTask = this.get(params.blocked_by_task_id);
        if (!blockingTask) {
          throw new Error(`Blocking task not found: ${params.blocked_by_task_id}`);
        }
      }

      // Prepare data
      const status = params.status || 'idle';
      const priority = params.priority ?? 0;
      const tags = params.tags ? JSON.stringify(params.tags) : null;
      const queueName = params.queue_name !== undefined ? params.queue_name : parentQueueName;

      const result = this.db.execute(
        `INSERT INTO tasks (title, description, status, assigned_to, created_by, priority, tags, parent_task_id, queue_name, blocked_by_task_id, auto_promote)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.title.trim(),
          params.description || null,
          status,
          params.assigned_to || null,
          params.created_by || null,
          priority,
          tags,
          params.parent_task_id || null,
          queueName,
          params.blocked_by_task_id || null,
          params.auto_promote === false ? 0 : 1,
        ]
      );

      const task = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [
        result.lastInsertRowid,
      ]);

      if (!task) {
        throw new Error('Failed to retrieve created task');
      }

      const parsedTask = this.parseTask(task);

      // Audit trail: creation is the first history entry for the task
      recordTaskHistory(
        this.db,
        task.id,
        [{ field_name: 'created', old_value: null, new_value: status }],
        params.created_by || null
      );

      // If this is a subtask, update parent status
      if (params.parent_task_id != null) {
        this.updateParentStatus(params.parent_task_id);
      }

      return parsedTask;
    });

    this.emit(TaskEventType.TaskCreated, { taskId: task.id, task, ...extractTaskContext(task) });
    return task;
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
    const comments = this.db.query<Comment>(
      'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC',
      [id]
    );
    const links = this.db.query<Link>(
      'SELECT * FROM links WHERE task_id = ? ORDER BY created_at ASC',
      [id]
    );

    return {
      ...parsedTask,
      comments: comments.map((c) => ({
        ...c,
        created_at: toISO8601(c.created_at),
        updated_at: toISO8601(c.updated_at),
      })),
      links: links.map((l) => ({
        ...l,
        created_at: toISO8601(l.created_at),
      })),
    };
  }

  /**
   * Update task fields
   */
  update(id: number, updates: UpdateTaskParams): ParsedTask {
    // Capture before state for events (read outside transaction — safe, just a SELECT)
    const beforeTask = this.get(id);
    if (!beforeTask) {
      throw new Error(`Task not found: ${id}`);
    }

    // Use a transaction to ensure atomic execution and immediate lock release
    const updated = this.db.transaction(() => {
      // Re-check inside transaction for atomicity
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Task not found: ${id}`);
      }

      // Validate status if provided
      if (updates.status && !this.isValidStatus(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}`);
      }

      // Validate parent_task_id if provided
      if (updates.parent_task_id !== undefined) {
        if (updates.parent_task_id !== null) {
          // Prevent task from being its own parent
          if (updates.parent_task_id === id) {
            throw new Error('Task cannot be its own parent');
          }

          // Validate parent exists
          const parent = this.get(updates.parent_task_id);
          if (!parent) {
            throw new Error(`Parent task not found: ${updates.parent_task_id}`);
          }

          // Prevent circular references
          if (this.wouldCreateCycle(id, updates.parent_task_id)) {
            throw new Error('Cannot create circular parent-child relationship');
          }

          // Validate nesting depth
          const depth = this.getTaskDepth(updates.parent_task_id);
          if (depth >= 3) {
            throw new Error('Maximum nesting depth (3 levels) exceeded');
          }
        }
      }

      // Validate blocked_by_task_id if provided
      if (updates.blocked_by_task_id !== undefined) {
        if (updates.blocked_by_task_id !== null) {
          // Prevent task from blocking itself
          if (updates.blocked_by_task_id === id) {
            throw new Error('Task cannot be blocked by itself');
          }

          // Validate blocking task exists
          const blockingTask = this.get(updates.blocked_by_task_id);
          if (!blockingTask) {
            throw new Error(`Blocking task not found: ${updates.blocked_by_task_id}`);
          }

          // Prevent circular blocking (A blocks B, B blocks A)
          if (blockingTask.blocked_by_task_id === id) {
            throw new Error('Cannot create circular blocking relationship');
          }
        }
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
        // Completion timestamp: set when entering 'complete', cleared on reopen
        if (updates.status === 'complete' && existing.status !== 'complete') {
          fields.push('completed_at = CURRENT_TIMESTAMP');
        } else if (updates.status !== 'complete' && existing.status === 'complete') {
          fields.push('completed_at = NULL');
        }
      }

      if (updates.assigned_to !== undefined) {
        // Check if assigned_to is actually changing
        const newAssignedTo = updates.assigned_to || null;
        const currentAssignedTo = existing.assigned_to;

        if (newAssignedTo !== currentAssignedTo) {
          // Save current assigned_to to previous_assigned_to
          fields.push('previous_assigned_to = ?');
          values.push(currentAssignedTo);
        }

        fields.push('assigned_to = ?');
        values.push(newAssignedTo);
      }

      if (updates.priority !== undefined) {
        fields.push('priority = ?');
        values.push(updates.priority);
      }

      if (updates.tags !== undefined) {
        fields.push('tags = ?');
        values.push(JSON.stringify(updates.tags));
      }

      if (updates.parent_task_id !== undefined) {
        fields.push('parent_task_id = ?');
        values.push(updates.parent_task_id);
      }

      if (updates.queue_name !== undefined) {
        fields.push('queue_name = ?');
        values.push(updates.queue_name);
      }

      if (updates.blocked_by_task_id !== undefined) {
        fields.push('blocked_by_task_id = ?');
        values.push(updates.blocked_by_task_id);
      }

      if (updates.auto_promote !== undefined) {
        fields.push('auto_promote = ?');
        values.push(updates.auto_promote ? 1 : 0);
      }

      // Always update updated_at
      fields.push('updated_at = CURRENT_TIMESTAMP');

      if (fields.length === 1) {
        // Only updated_at would be updated, no actual changes
        return existing;
      }

      values.push(id);

      this.db.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);

      // Audit trail: record what changed (old -> new) and who changed it.
      // Mirrors the normalizations used when building the UPDATE above; unchanged
      // fields are not recorded.
      const historyChanges: HistoryChange[] = [];
      const diffField = (fieldName: string, oldValue: unknown, newValue: unknown): void => {
        const oldStr = oldValue === undefined || oldValue === null ? null : String(oldValue);
        const newStr = newValue === undefined || newValue === null ? null : String(newValue);
        if (oldStr !== newStr) {
          historyChanges.push({ field_name: fieldName, old_value: oldStr, new_value: newStr });
        }
      };

      if (updates.title !== undefined) diffField('title', existing.title, updates.title.trim());
      if (updates.description !== undefined) {
        diffField('description', existing.description, updates.description || null);
      }
      if (updates.status !== undefined) diffField('status', existing.status, updates.status);
      if (updates.assigned_to !== undefined) {
        diffField('assigned_to', existing.assigned_to, updates.assigned_to || null);
      }
      if (updates.priority !== undefined) {
        diffField('priority', existing.priority, updates.priority);
      }
      if (updates.tags !== undefined) {
        diffField(
          'tags',
          existing.tags ? JSON.stringify(existing.tags) : null,
          updates.tags ? JSON.stringify(updates.tags) : null
        );
      }
      if (updates.parent_task_id !== undefined) {
        diffField('parent_task_id', existing.parent_task_id, updates.parent_task_id);
      }
      if (updates.queue_name !== undefined) {
        diffField('queue_name', existing.queue_name, updates.queue_name);
      }
      if (updates.blocked_by_task_id !== undefined) {
        diffField('blocked_by_task_id', existing.blocked_by_task_id, updates.blocked_by_task_id);
      }
      if (updates.auto_promote !== undefined) {
        diffField('auto_promote', existing.auto_promote, updates.auto_promote);
      }

      recordTaskHistory(this.db, id, historyChanges, updates.updated_by?.trim() || null);

      const updated = this.get(id);
      if (!updated) {
        throw new Error('Failed to retrieve updated task');
      }

      // Update parent status when status changes or parent changes
      if (updates.status !== undefined && existing.parent_task_id != null) {
        this.updateParentStatus(existing.parent_task_id);
      }

      // If parent_task_id changed, update both old and new parents
      if (updates.parent_task_id !== undefined) {
        // Update old parent (if it existed)
        if (existing.parent_task_id != null) {
          this.updateParentStatus(existing.parent_task_id);
        }
        // Update new parent (if it exists)
        if (updates.parent_task_id != null) {
          this.updateParentStatus(updates.parent_task_id);
        }
      }

      return updated;
    });

    // Emit events after transaction
    if (this.eventBus) {
      const before = beforeTask;

      // Compute changed fields
      const changedFields: string[] = [];
      for (const key of Object.keys(updates) as string[]) {
        const newVal = (updates as Record<string, unknown>)[key];
        const oldVal = (before as unknown as Record<string, unknown>)[key];
        if (newVal !== undefined && JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
          changedFields.push(key);
        }
      }

      this.emit(TaskEventType.TaskUpdated, {
        taskId: id,
        before,
        after: updated,
        changedFields,
        ...extractTaskContext(updated),
      });

      // Conditional events
      if (updates.status !== undefined && updates.status !== before.status) {
        this.emit(TaskEventType.TaskStatusChanged, {
          taskId: id,
          before: before.status,
          after: updates.status,
          ...extractTaskContext(updated),
        });
      }
      if (
        updates.assigned_to !== undefined &&
        (updates.assigned_to || null) !== before.assigned_to
      ) {
        this.emit(TaskEventType.TaskAssigned, {
          taskId: id,
          before: before.assigned_to,
          after: updates.assigned_to || null,
          ...extractTaskContext(updated),
        });
      }
      if (updates.queue_name !== undefined && updates.queue_name !== before.queue_name) {
        this.emit(TaskEventType.TaskQueueChanged, {
          taskId: id,
          before: before.queue_name,
          after: updates.queue_name,
          ...extractTaskContext(updated),
        });
      }
    }

    return updated;
  }

  /**
   * Delete task permanently
   */
  delete(id: number): void {
    let taskContext: TaskContext | null = null;
    this.db.transaction(() => {
      // Capture full task before deletion (for event context)
      const task = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      const parentId = task?.parent_task_id;

      const result = this.db.execute('DELETE FROM tasks WHERE id = ?', [id]);

      if (result.changes === 0) {
        throw new Error(`Task not found: ${id}`);
      }

      // Extract context before transaction ends
      if (task) {
        const parsed = this.parseTask(task);
        taskContext = extractTaskContext(parsed);
      }

      // Update parent status if task had a parent
      if (parentId != null) {
        this.updateParentStatus(parentId);
      }
    });

    this.emit(TaskEventType.TaskDeleted, {
      taskId: id,
      ...(taskContext ?? { assignee: null, owner: null, status: 'idle' as TaskStatus, cue: null }),
    });
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

    if (filters.queue_name !== undefined) {
      conditions.push('queue_name = ?');
      values.push(filters.queue_name);
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // Enforce a default limit so list responses stay bounded (token burn guard).
    const limit = filters.limit ?? TaskService.DEFAULT_LIST_LIMIT;
    const limitClause = `LIMIT ${limit}`;
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : '';
    const columns = this.resolveListColumns(filters.include_description);

    const sql = `
      SELECT ${columns} FROM tasks
      ${whereClause}
      ORDER BY priority DESC, created_at ASC
      ${limitClause} ${offsetClause}
    `;

    const tasks = this.db.query<Task>(sql, values);
    return tasks.map((task) => this.parseTask(task));
  }

  /**
   * Get agent's task queue (assigned open tasks)
   */
  getQueue(agentName: string, includeDescription?: boolean): ParsedTask[] {
    const columns = this.resolveListColumns(includeDescription);
    const tasks = this.db.query<Task>(
      `SELECT ${columns} FROM tasks
       WHERE assigned_to = ?
         AND status IN ('idle', 'working')
         AND archived_at IS NULL
       ORDER BY priority DESC, created_at ASC`,
      [agentName]
    );

    return tasks.map((task) => this.parseTask(task));
  }

  /**
   * Archive a task (soft delete)
   */
  archive(id: number): ParsedTask {
    // Use a transaction to ensure atomic execution and immediate lock release
    const archived = this.db.transaction(() => {
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Task not found: ${id}`);
      }

      this.db.execute('UPDATE tasks SET archived_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

      const archivedTask = this.get(id);
      if (!archivedTask) {
        throw new Error('Failed to retrieve archived task');
      }

      // Audit trail: archive is a task change too
      recordTaskHistory(
        this.db,
        id,
        [
          {
            field_name: 'archived_at',
            old_value: null,
            new_value: String(archivedTask.archived_at),
          },
        ],
        null
      );

      // Update parent status if task had a parent
      if (existing.parent_task_id != null) {
        this.updateParentStatus(existing.parent_task_id);
      }

      return archivedTask;
    });

    this.emit(TaskEventType.TaskArchived, {
      taskId: id,
      task: archived,
      ...extractTaskContext(archived),
    });
    return archived;
  }

  /**
   * Get the audit-trail history for a task (chronological, oldest first).
   * Each entry captures which field changed, its old/new values, the acting
   * agent (when known) and when the change happened.
   */
  getHistory(taskId: number): TaskHistory[] {
    if (!this.get(taskId)) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return getTaskHistory(this.db, taskId);
  }

  /**
   * Sign up for the highest priority idle task in agent's queue
   * Atomically marks the task as 'working' and returns it
   */
  signupForTask(agentName: string): TaskWithRelations | null {
    const result = this.db.transaction(() => {
      // Get first idle task from agent's queue
      const task = this.db.queryOne<Task>(
        `SELECT * FROM tasks
         WHERE assigned_to = ?
           AND status = 'idle'
           AND archived_at IS NULL
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`,
        [agentName]
      );

      if (!task) {
        return null;
      }

      // Update task to working status
      this.db.execute('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        'working',
        task.id,
      ]);

      // Update parent status if task is a subtask
      if (task.parent_task_id != null) {
        this.updateParentStatus(task.parent_task_id);
      }

      // Return task with relations
      const updatedTask = this.get(task.id, true);
      if (!updatedTask) {
        throw new Error('Failed to retrieve updated task');
      }

      return updatedTask;
    });

    if (result) {
      const ctx = extractTaskContext(result);
      this.emit(TaskEventType.TaskSignedUp, { taskId: result.id, agent: agentName, ...ctx });
      this.emit(TaskEventType.TaskStatusChanged, {
        taskId: result.id,
        before: 'idle' as TaskStatus,
        after: 'working' as TaskStatus,
        ...ctx,
      });
    }

    return result;
  }

  /**
   * Transfer task from current agent to new agent
   * Atomically updates assignment, status, and adds handoff comment
   */
  moveTask(
    taskId: number,
    currentAgent: string,
    newAgent: string,
    comment: string
  ): { task: ParsedTask; comment: CommentData } {
    const result = this.db.transaction(() => {
      // Verify task and ownership
      const task = this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);

      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      if (task.assigned_to !== currentAgent) {
        throw new Error(
          `Task ${taskId} is not assigned to ${currentAgent} (currently assigned to: ${task.assigned_to || 'no one'})`
        );
      }

      if (task.status !== 'idle' && task.status !== 'working') {
        throw new Error(
          `Task ${taskId} with status '${task.status}' cannot be transferred (only 'idle' or 'working' are allowed)`
        );
      }

      // Update task assignment and status, tracking previous assignee
      this.db.execute(
        `UPDATE tasks
         SET assigned_to = ?, previous_assigned_to = ?, status = 'idle', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newAgent, currentAgent, taskId]
      );

      // Audit trail: transfer records the assignee change (and status reset when
      // the task was working) with the transferring agent as the actor
      const transferChanges: HistoryChange[] = [
        { field_name: 'assigned_to', old_value: task.assigned_to, new_value: newAgent },
      ];
      if (task.status !== 'idle') {
        transferChanges.push({ field_name: 'status', old_value: task.status, new_value: 'idle' });
      }
      recordTaskHistory(this.db, taskId, transferChanges, currentAgent);

      // Update parent status if task is a subtask (status changed to idle)
      if (task.parent_task_id != null) {
        this.updateParentStatus(task.parent_task_id);
      }

      // Add handoff comment
      const commentResult = this.db.execute(
        'INSERT INTO comments (task_id, content, created_by) VALUES (?, ?, ?)',
        [taskId, comment.trim(), currentAgent]
      );

      // Get the newly created comment
      const newComment = this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [
        commentResult.lastInsertRowid,
      ]);
      if (!newComment) {
        throw new Error('Failed to retrieve created comment');
      }

      // Get the updated task (without relations) — already parsed with ISO 8601 timestamps
      const updatedTask = this.get(taskId);
      if (!updatedTask) {
        throw new Error('Failed to retrieve updated task');
      }

      return {
        task: updatedTask,
        comment: {
          ...newComment,
          created_at: toISO8601(newComment.created_at),
          updated_at: toISO8601(newComment.updated_at),
        },
      };
    });

    const ctx = extractTaskContext(result.task);
    this.emit(TaskEventType.TaskTransferred, {
      taskId,
      from: currentAgent,
      to: newAgent,
      comment: comment.trim(),
      ...ctx,
    });
    this.emit(TaskEventType.CommentAdded, {
      taskId,
      comment: result.comment,
      ...ctx,
    });

    return result;
  }

  /**
   * Get subtasks for a parent task
   */
  getSubtasks(parentId: number, recursive = false, includeArchived = false): ParsedTask[] {
    if (!recursive) {
      // Get immediate children
      const tasks = this.db.query<Task>(
        `SELECT * FROM tasks
         WHERE parent_task_id = ?
         ${includeArchived ? '' : 'AND archived_at IS NULL'}
         ORDER BY priority DESC, created_at ASC`,
        [parentId]
      );
      return tasks.map((task) => this.parseTask(task));
    } else {
      // Get all descendants using recursive CTE
      const tasks = this.db.query<Task>(
        `WITH RECURSIVE subtask_tree AS (
           -- Base case: immediate children
           SELECT * FROM tasks WHERE parent_task_id = ?
           UNION ALL
           -- Recursive case: children of children
           SELECT t.*
           FROM tasks t
           INNER JOIN subtask_tree st ON t.parent_task_id = st.id
         )
         SELECT * FROM subtask_tree
         ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
         ORDER BY priority DESC, created_at ASC`,
        [parentId]
      );
      return tasks.map((task) => this.parseTask(task));
    }
  }

  /**
   * Get task with all its subtasks
   */
  getTaskWithSubtasks(taskId: number, recursive = false): TaskWithSubtasks | null {
    const task = this.get(taskId);
    if (!task) {
      return null;
    }

    const subtasks = this.getSubtasks(taskId, recursive);

    return {
      ...task,
      subtasks,
      subtask_count: subtasks.length,
    };
  }

  /**
   * Create a subtask under a parent task
   */
  createSubtask(parentTaskId: number, taskData: CreateTaskParams): ParsedTask {
    const task = this.create({
      ...taskData,
      parent_task_id: parentTaskId,
    });

    this.emit(TaskEventType.SubtaskCreated, {
      taskId: task.id,
      parentId: parentTaskId,
      task,
      ...extractTaskContext(task),
    });
    return task;
  }

  /**
   * Move a subtask to a different parent or make it top-level
   */
  moveSubtask(subtaskId: number, newParentId: number | null): ParsedTask {
    // Capture old parent before update
    const existing = this.get(subtaskId);
    const oldParentId = existing?.parent_task_id ?? null;

    const updated = this.update(subtaskId, {
      parent_task_id: newParentId,
    });

    this.emit(TaskEventType.SubtaskMoved, {
      taskId: subtaskId,
      oldParentId,
      newParentId,
      ...extractTaskContext(updated),
    });
    return updated;
  }

  /**
   * Get all tasks that are blocked by a specific task
   * Useful for notifications or cascade operations
   */
  getBlockedTasks(blockingTaskId: number): ParsedTask[] {
    const tasks = this.db.query<Task>(
      'SELECT * FROM tasks WHERE blocked_by_task_id = ? AND archived_at IS NULL',
      [blockingTaskId]
    );

    return tasks.map((task) => this.parseTask(task));
  }

  /**
   * Validate status value
   */
  private isValidStatus(status: string): status is TaskStatus {
    return ['idle', 'working', 'complete'].includes(status);
  }

  /**
   * Check if setting newParentId as parent of taskId would create a cycle
   */
  private wouldCreateCycle(taskId: number, newParentId: number): boolean {
    if (taskId === newParentId) {
      return true;
    }

    // Check if newParentId is a descendant of taskId
    const descendants = this.getSubtasks(taskId, true);
    return descendants.some((t) => t.id === newParentId);
  }

  /**
   * Get the depth of a task in the hierarchy (0 = top-level, 1 = first level subtask, etc.)
   */
  private getTaskDepth(taskId: number): number {
    let depth = 0;
    let currentId: number | null = taskId;

    while (currentId !== null && depth < 10) {
      // Safety limit
      const task = this.get(currentId);
      if (!task) {
        break;
      }
      currentId = task.parent_task_id;
      if (currentId !== null) {
        depth++;
      }
    }

    return depth;
  }

  /**
   * Check if a task is currently blocked
   * A task is blocked if:
   * 1. It has a blocked_by_task_id set
   * 2. The blocking task exists
   * 3. The blocking task status is NOT 'complete'
   */
  private isCurrentlyBlocked(task: Task): boolean {
    if (!task.blocked_by_task_id) {
      return false;
    }

    const blockingTask = this.db.queryOne<Task>('SELECT id, status FROM tasks WHERE id = ?', [
      task.blocked_by_task_id,
    ]);

    if (!blockingTask) {
      // Blocking task doesn't exist (shouldn't happen with FK, but defensive)
      return false;
    }

    // Blocked if blocking task is not complete
    return blockingTask.status !== 'complete';
  }

  /**
   * Parse task from database row (handle JSON tags, compute blocking state, convert timestamps to ISO 8601)
   */
  /**
   * Columns for list-style queries. Description is excluded by default to keep
   * payloads small — it dominates list response size and burns agent tokens.
   */
  private static readonly TASK_SUMMARY_COLUMNS = [
    'id',
    'title',
    'status',
    'assigned_to',
    'previous_assigned_to',
    'created_by',
    'priority',
    'tags',
    'parent_task_id',
    'queue_name',
    'blocked_by_task_id',
    'auto_promote',
    'created_at',
    'updated_at',
    'archived_at',
  ].join(', ');

  /** Server-wide default maximum for list results. */
  private static readonly DEFAULT_LIST_LIMIT = 100;

  /**
   * Resolve the column projection for list-style queries.
   * Descriptions are omitted unless explicitly requested via the filter or the
   * TINYTASK_LIST_INCLUDE_DESCRIPTION=true environment escape hatch.
   */
  private resolveListColumns(includeDescription?: boolean): string {
    const wantDescription =
      includeDescription ?? process.env.TINYTASK_LIST_INCLUDE_DESCRIPTION === 'true';
    return wantDescription ? '*' : TaskService.TASK_SUMMARY_COLUMNS;
  }

  private parseTask(task: Task): ParsedTask {
    return {
      ...task,
      tags: task.tags ? JSON.parse(task.tags as string) : [],
      is_currently_blocked: this.isCurrentlyBlocked(task),
      auto_promote: task.auto_promote !== 0,
      created_at: toISO8601(task.created_at),
      updated_at: toISO8601(task.updated_at),
      completed_at: task.completed_at ? toISO8601(task.completed_at) : null,
      archived_at: task.archived_at ? toISO8601(task.archived_at) : null,
    };
  }

  /**
   * Update parent task status based on child task statuses
   * Business rules:
   * - If all children are 'complete' → parent is 'complete'
   * - Else if any child is 'working' → parent is 'working'
   * - Else (all children are 'idle') → parent is 'idle'
   */
  private updateParentStatus(parentId: number): void {
    // Get all non-archived children
    const children = this.db.query<Task>(
      `SELECT id, status FROM tasks
       WHERE parent_task_id = ?
         AND archived_at IS NULL`,
      [parentId]
    );

    // If no children, don't change parent status
    if (children.length === 0) {
      return;
    }

    // Determine parent status based on children
    let newStatus: TaskStatus;

    const allComplete = children.every((child) => child.status === 'complete');
    const anyWorking = children.some((child) => child.status === 'working');

    if (allComplete) {
      newStatus = 'complete';
    } else if (anyWorking) {
      newStatus = 'working';
    } else {
      // All children must be idle
      newStatus = 'idle';
    }

    // Check parent's auto_promote opt-out flag
    const parent = this.db.queryOne<Task>(
      'SELECT id, status, auto_promote FROM tasks WHERE id = ?',
      [parentId]
    );

    if (!parent || parent.status === newStatus || parent.auto_promote === 0) {
      // No change needed, or parent opted out of auto-promotion.
      // Status is unchanged, so no need to propagate to grandparents either.
      return;
    }

    // Route the promotion through update() so it is auditable: updated_at is
    // refreshed, TaskUpdated/TaskStatusChanged events are emitted, and the
    // grandparent is updated recursively when this status change lands.
    // updated_by 'system' marks it as machine-driven in task_history.
    this.update(parentId, { status: newStatus, updated_by: 'system' });
  }
}
