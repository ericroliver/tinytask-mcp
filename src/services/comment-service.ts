/**
 * Comment service - Business logic for comment operations
 */

import { DatabaseClient } from '../db/client.js';
import { Comment, CreateCommentParams } from '../types/index.js';

export class CommentService {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new comment
   */
  create(params: CreateCommentParams): Comment {
    // Validate required fields
    if (!params.content || params.content.trim().length === 0) {
      throw new Error('Comment content is required');
    }

    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
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

      const comment = this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [
        result.lastInsertRowid,
      ]);

      if (!comment) {
        throw new Error('Failed to retrieve created comment');
      }

      return comment;
    });
  }

  /**
   * Get comment by ID
   */
  get(id: number): Comment | null {
    return this.db.queryOne<Comment>('SELECT * FROM comments WHERE id = ?', [id]);
  }

  /**
   * Update comment content
   */
  update(id: number, content: string): Comment {
    // Use a transaction to ensure atomic execution and immediate lock release
    return this.db.transaction(() => {
      // Validate content
      if (!content || content.trim().length === 0) {
        throw new Error('Comment content cannot be empty');
      }

      // Check if comment exists
      const existing = this.get(id);
      if (!existing) {
        throw new Error(`Comment not found: ${id}`);
      }

      this.db.execute(
        'UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [content.trim(), id]
      );

      const updated = this.get(id);
      if (!updated) {
        throw new Error('Failed to retrieve updated comment');
      }

      return updated;
    });
  }

  /**
   * Delete comment permanently
   */
  delete(id: number): void {
    const result = this.db.execute('DELETE FROM comments WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Comment not found: ${id}`);
    }
  }

  /**
   * List all comments for a task
   */
  listByTask(taskId: number): Comment[] {
    return this.db.query<Comment>(
      'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC',
      [taskId]
    );
  }
}
