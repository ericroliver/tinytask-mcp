/**
 * Comment service - Business logic for comment operations
 */

import { DatabaseClient } from '../db/client.js';
import { Comment, CreateCommentParams, CommentData, Task } from '../types/index.js';
import { toISO8601 } from '../utils/timestamp.js';
import { EventBus } from '../events/event-bus.js';
import { TaskEventType, createEvent } from '../events/event-types.js';
import type { TaskContext } from '../events/event-types.js';

export class CommentService {
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
   * Parse comment from database row (convert timestamps to ISO 8601)
   */
  private parseComment(comment: Comment): CommentData {
    return {
      ...comment,
      created_at: toISO8601(comment.created_at),
      updated_at: toISO8601(comment.updated_at),
    };
  }

  /**
   * Create a new comment
   */
  create(params: CreateCommentParams): CommentData {
    // Validate required fields
    if (!params.content || params.content.trim().length === 0) {
      throw new Error('Comment content is required');
    }

    // Use a transaction to ensure atomic execution and immediate lock release
    const comment = this.db.transaction(() => {
      // Verify task exists
      const task = this.db.queryOne('SELECT id FROM tasks WHERE id = ?', [params.task_id]);
      if (!task) {
        throw new Error(`Task not found: ${params.task_id}`);
      }

      const result = this.db.execute(
        `INSERT INTO comments (task_id, content, created_by)
         VALUES (?, ?, ?)`,
        [params.task_id, params.content.trim(), params.created_by || null]
      );

      const created = this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [
        result.lastInsertRowid,
      ]);

      if (!created) {
        throw new Error('Failed to retrieve created comment');
      }

      return this.parseComment(created);
    });

    this.emit(TaskEventType.CommentAdded, {
      taskId: params.task_id,
      comment,
      ...(this.getTaskContext(params.task_id) ?? {}),
    });
    return comment;
  }

  /**
   * Get comment by ID
   */
  get(id: number): CommentData | null {
    const comment = this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [id]);
    return comment ? this.parseComment(comment) : null;
  }

  /**
   * Update comment content
   */
  update(id: number, content: string): CommentData {
    let beforeContent = '';
    let taskId = 0;
    // Use a transaction to ensure atomic execution and immediate lock release
    const updated = this.db.transaction(() => {
      // Validate content
      if (!content || content.trim().length === 0) {
        throw new Error('Comment content cannot be empty');
      }

      // Check if comment exists
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Comment not found: ${id}`);
      }

      beforeContent = existing.content;
      taskId = existing.task_id;

      this.db.execute(
        'UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [content.trim(), id]
      );

      const updatedComment = this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [id]);
      if (!updatedComment) {
        throw new Error('Failed to retrieve updated comment');
      }

      return this.parseComment(updatedComment);
    });

    this.emit(TaskEventType.CommentUpdated, {
      taskId,
      commentId: id,
      before: beforeContent,
      after: content.trim(),
      ...(this.getTaskContext(taskId) ?? {}),
    });
    return updated;
  }

  /**
   * Delete comment permanently
   */
  delete(id: number): void {
    // Capture task_id before deletion for event emission
    const comment = this.db.queryOne<Comment>('SELECT task_id FROM comments WHERE id = ?', [id]);
    if (!comment) {
      throw new Error(`Comment not found: ${id}`);
    }

    const result = this.db.execute('DELETE FROM comments WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Comment not found: ${id}`);
    }

    this.emit(TaskEventType.CommentDeleted, {
      taskId: comment.task_id,
      commentId: id,
      ...(this.getTaskContext(comment.task_id) ?? {}),
    });
  }

  /**
   * Move a comment to a different task.
   * Creates a copy on the target task, then updates the original comment text
   * to leave a record: "Comment moved to task <newTaskId> comment <newCommentId>".
   * Returns the new comment data.
   */
  move(commentId: number, toTaskId: number): CommentData {
    const result = this.db.transaction(() => {
      // Fetch the original comment
      const original = this.get(commentId);
      if (!original) {
        throw new Error(`Comment not found: ${commentId}`);
      }

      // Verify target task exists
      const task = this.db.queryOne('SELECT id FROM tasks WHERE id = ?', [toTaskId]);
      if (!task) {
        throw new Error(`Target task not found: ${toTaskId}`);
      }

      // Create the copy on the target task
      const insertResult = this.db.execute(
        `INSERT INTO comments (task_id, content, created_by)
         VALUES (?, ?, ?)`,
        [toTaskId, original.content, original.created_by || null]
      );

      const newCommentId = insertResult.lastInsertRowid as number;
      const newComment = this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [
        newCommentId,
      ]);
      if (!newComment) {
        throw new Error('Failed to retrieve moved comment');
      }

      // Update the original comment to leave a record
      this.db.execute(
        'UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [`Comment moved to task ${toTaskId} comment ${newCommentId}`, commentId]
      );

      return this.parseComment(newComment);
    });

    this.emit(TaskEventType.CommentAdded, {
      taskId: toTaskId,
      comment: result,
      ...(this.getTaskContext(toTaskId) ?? {}),
    });
    return result;
  }

  /**
   * List all comments for a task
   */
  listByTask(taskId: number): CommentData[] {
    const comments = this.db.query<Comment>(
      'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC',
      [taskId]
    );
    return comments.map((c) => this.parseComment(c));
  }
}
