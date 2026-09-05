/**
 * Core type definitions for TinyTask
 */

export type TaskStatus = 'idle' | 'working' | 'complete';

// Parsed task (with tags as array)
export interface ParsedTask {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  previous_assigned_to: string | null;
  created_by: string | null;
  priority: number;
  tags: string[];
  parent_task_id: number | null;
  queue_name: string | null;
  blocked_by_task_id: number | null;
  is_currently_blocked: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// Task with relations (comments and links)
export interface TaskWithRelations extends ParsedTask {
  comments?: CommentData[];
  links?: LinkData[];
}

// Task with subtasks (hierarchical view)
export interface TaskWithSubtasks extends ParsedTask {
  subtasks: ParsedTask[];
  subtask_count: number;
}

export interface CommentData {
  id: number;
  task_id: number;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkData {
  id: number;
  task_id: number;
  url: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateTaskParams {
  title: string;
  description?: string;
  status?: TaskStatus;
  assigned_to?: string;
  created_by: string;
  priority?: number;
  tags?: string[];
  parent_task_id?: number;
  queue_name?: string;
  blocked_by_task_id?: number;
}

export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigned_to?: string;
  priority?: number;
  tags?: string[];
  parent_task_id?: number | null;
  queue_name?: string;
  blocked_by_task_id?: number | null;
}

export interface TaskFilters {
  assigned_to?: string;
  status?: TaskStatus | TaskStatus[];
  exclude_status?: TaskStatus[];
  include_archived?: boolean;
  include_description?: boolean;
  limit?: number;
  offset?: number;
  queue_name?: string;
  parent_task_id?: number | null;
  exclude_subtasks?: boolean;
}

export interface CreateCommentParams {
  task_id: number;
  content: string;
  created_by?: string;
}

export interface CreateLinkParams {
  task_id: number;
  url: string;
  description?: string;
  created_by?: string;
}

export interface UpdateLinkParams {
  url?: string;
  description?: string;
}

export interface QueueStats {
  queue_name: string;
  total_tasks: number;
  by_status: {
    idle: number;
    working: number;
    complete: number;
  };
  assigned: number;
  unassigned: number;
  agents: string[];
}

// Re-export database types
export * from './database.js';
