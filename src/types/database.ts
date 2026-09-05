/**
 * Database types for TinyTask
 */

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'idle' | 'working' | 'complete';
  assigned_to: string | null;
  previous_assigned_to: string | null;
  created_by: string | null;
  priority: number;
  tags: string | null; // JSON array
  parent_task_id: number | null;
  queue_name: string | null;
  blocked_by_task_id: number | null;
  auto_promote: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Comment {
  id: number;
  task_id: number;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Link {
  id: number;
  task_id: number;
  url: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaskHistory {
  id: number;
  task_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: 'idle' | 'working' | 'complete';
  assigned_to?: string;
  created_by?: string;
  priority?: number;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: 'idle' | 'working' | 'complete';
  assigned_to?: string;
  priority?: number;
  tags?: string[];
}

export interface CreateCommentInput {
  task_id: number;
  content: string;
  created_by?: string;
}

export interface UpdateCommentInput {
  content: string;
}

export interface CreateLinkInput {
  task_id: number;
  url: string;
  description?: string;
  created_by?: string;
}

export interface UpdateLinkInput {
  url?: string;
  description?: string;
}
