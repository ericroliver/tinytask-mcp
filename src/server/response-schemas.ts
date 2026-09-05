/**
 * Response Zod schemas for OpenAPI spec generation
 *
 * These schemas describe the shape of data returned by the REST adapter.
 * Input schemas already exist in tool-definitions.ts; these cover the response side.
 */

import { z } from 'zod';

// ─── Core domain types ──────────────────────────────────────

export const TaskStatusSchema = z.enum(['idle', 'working', 'complete']);

export const ParsedTaskSchema = z.object({
  id: z.number().describe('Unique task identifier'),
  title: z.string().describe('Task title'),
  description: z.string().nullable().describe('Task description'),
  status: TaskStatusSchema.describe('Current task status'),
  assigned_to: z.string().nullable().describe('Agent assigned to this task'),
  previous_assigned_to: z.string().nullable().describe('Previous assignee before current'),
  created_by: z.string().nullable().describe('Agent who created the task'),
  priority: z.number().describe('Priority level (higher = more important)'),
  tags: z.array(z.string()).describe('Array of tags'),
  parent_task_id: z.number().nullable().describe('Parent task ID if this is a subtask'),
  queue_name: z.string().nullable().describe('Queue name the task belongs to'),
  blocked_by_task_id: z.number().nullable().describe('ID of task blocking this one'),
  is_currently_blocked: z.boolean().describe('Whether the task is currently blocked'),
  auto_promote: z.boolean().describe("Whether the task's status auto-updates from its children (default: true)"),
  created_at: z.string().describe('ISO timestamp of creation'),
  updated_at: z.string().describe('ISO timestamp of last update'),
  archived_at: z.string().nullable().describe('ISO timestamp of archival, null if not archived'),
});

export const CommentDataSchema = z.object({
  id: z.number().describe('Unique comment identifier'),
  task_id: z.number().describe('Task the comment belongs to'),
  content: z.string().describe('Comment text'),
  created_by: z.string().nullable().describe('Agent who wrote the comment'),
  created_at: z.string().describe('ISO timestamp of creation'),
  updated_at: z.string().describe('ISO timestamp of last update'),
});

export const LinkDataSchema = z.object({
  id: z.number().describe('Unique link identifier'),
  task_id: z.number().describe('Task the link belongs to'),
  url: z.string().describe('Link URL or path'),
  description: z.string().nullable().describe('Description of the linked artifact'),
  created_by: z.string().nullable().describe('Agent who added the link'),
  created_at: z.string().describe('ISO timestamp of creation'),
});

export const TaskWithRelationsSchema = ParsedTaskSchema.extend({
  comments: z.array(CommentDataSchema).optional().describe('Comments on this task'),
  links: z.array(LinkDataSchema).optional().describe('Links on this task'),
});

export const TaskWithSubtasksSchema = ParsedTaskSchema.extend({
  subtasks: z.array(ParsedTaskSchema).describe('Direct subtasks of this task'),
  subtask_count: z.number().describe('Number of direct subtasks'),
});

// ─── Queue types ────────────────────────────────────────────

export const QueueStatsSchema = z.object({
  queue_name: z.string().describe('Name of the queue'),
  total_tasks: z.number().describe('Total tasks in the queue'),
  by_status: z.object({
    idle: z.number().describe('Number of idle tasks'),
    working: z.number().describe('Number of working tasks'),
    complete: z.number().describe('Number of complete tasks'),
  }),
  assigned: z.number().describe('Number of assigned tasks'),
  unassigned: z.number().describe('Number of unassigned tasks'),
  agents: z.array(z.string()).describe('List of agents with tasks in this queue'),
});

// ─── List/wrapper types ──────────────────────────────────────

/**
 * List responses omit `description` unless explicitly requested
 * (include_description=true) to keep payloads small.
 */
export const TaskListItemSchema = ParsedTaskSchema.omit({ description: true }).extend({
  description: z
    .string()
    .nullable()
    .optional()
    .describe('Task description - omitted unless include_description=true'),
});

export const TaskListSchema = z.array(TaskListItemSchema);
export const CommentListSchema = z.array(CommentDataSchema);
export const LinkListSchema = z.array(LinkDataSchema);
export const StringListSchema = z.array(z.string());

export const DeletedResponseSchema = z.object({
  success: z.boolean().describe('Whether the deletion succeeded'),
  id: z.number().describe('ID of the deleted resource'),
});

export const ClearedQueueResponseSchema = z.object({
  success: z.boolean().describe('Whether the clear succeeded'),
  queue_name: z.string().describe('Name of the cleared queue'),
  tasks_removed: z.number().describe('Number of tasks removed from the queue'),
});

export const TaskTransferResponseSchema = z.object({
  task: ParsedTaskSchema.describe('The transferred task with updated assignment'),
  comment: CommentDataSchema.describe('The handoff comment created during transfer'),
}).describe('Response shape for task transfer: includes the updated task and the handoff comment');

export const ErrorResponseSchema = z.object({
  error: z.string().describe('Error message'),
  details: z.string().optional().describe('Additional error details'),
});

// ─── Type exports ────────────────────────────────────────────

export type ParsedTaskResponse = z.infer<typeof ParsedTaskSchema>;
export type TaskWithRelationsResponse = z.infer<typeof TaskWithRelationsSchema>;
export type TaskWithSubtasksResponse = z.infer<typeof TaskWithSubtasksSchema>;
export type CommentDataResponse = z.infer<typeof CommentDataSchema>;
export type LinkDataResponse = z.infer<typeof LinkDataSchema>;
export type QueueStatsResponse = z.infer<typeof QueueStatsSchema>;
