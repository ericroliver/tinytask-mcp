/**
 * Type definitions for tool handler parameters
 */

// Task handler parameter types
export interface CreateTaskParams {
  title: string;
  description?: string;
  assigned_to?: string;
  created_by?: string;
  priority?: number;
  tags?: string[];
}

export interface UpdateTaskParams {
  id: number;
  title?: string;
  description?: string;
  status?: 'idle' | 'working' | 'complete';
  assigned_to?: string;
  priority?: number;
  tags?: string[];
}

export interface GetTaskParams {
  id: number;
}

export interface DeleteTaskParams {
  id: number;
}

export interface ArchiveTaskParams {
  id: number;
}

export interface ListTasksParams {
  assigned_to?: string;
  status?: 'idle' | 'working' | 'complete';
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetMyQueueParams {
  agent_name: string;
}

export interface SignupForTaskParams {
  agent_name: string;
}

export interface MoveTaskParams {
  task_id: number;
  current_agent: string;
  new_agent: string;
  comment: string;
}

// Comment handler parameter types
export interface AddCommentParams {
  task_id: number;
  content: string;
  created_by?: string;
}

export interface UpdateCommentParams {
  id: number;
  content: string;
}

export interface DeleteCommentParams {
  id: number;
}

export interface ListCommentsParams {
  task_id: number;
}

// Link handler parameter types
export interface AddLinkParams {
  task_id: number;
  url: string;
  description?: string;
  created_by?: string;
}

export interface UpdateLinkParams {
  id: number;
  url?: string;
  description?: string;
}

export interface DeleteLinkParams {
  id: number;
}

export interface ListLinksParams {
  task_id: number;
}
