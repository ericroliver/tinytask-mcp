/**
 * Comment tool handler functions
 */

import { CommentService } from '../services/index.js';

export async function addCommentHandler(
  commentService: CommentService,
  params: {
    task_id: number;
    content: string;
    created_by?: string;
  }
) {
  try {
    const comment = commentService.create(params);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(comment, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error adding comment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function updateCommentHandler(
  commentService: CommentService,
  params: {
    id: number;
    content: string;
  }
) {
  try {
    const comment = commentService.update(params.id, params.content);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(comment, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error updating comment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function deleteCommentHandler(commentService: CommentService, params: { id: number }) {
  try {
    commentService.delete(params.id);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `Comment ${params.id} deleted successfully`,
            id: params.id,
          }),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error deleting comment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getCommentHandler(commentService: CommentService, params: { id: number }) {
  try {
    const comment = commentService.get(params.id);
    if (!comment) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Comment not found: ${params.id}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(comment, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting comment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function moveCommentHandler(
  commentService: CommentService,
  params: { comment_id: number; to_task_id: number }
) {
  try {
    const newComment = commentService.move(params.comment_id, params.to_task_id);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(newComment, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving comment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function listCommentsHandler(
  commentService: CommentService,
  params: { task_id: number }
) {
  try {
    const comments = commentService.listByTask(params.task_id);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              task_id: params.task_id,
              count: comments.length,
              comments,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error listing comments: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
