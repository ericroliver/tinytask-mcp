/**
 * Type definitions for tool handler parameters
 */

// Task handler parameter types
export interface CreateTaskParams {
  title: string;
  description?: string;
  assigned_to?: string;
  created_by: string;
  priority?: number;
  tags?: string[];
  parent_task_id?: number;
  queue_name?: string;
}

export interface UpdateTaskParams {
  id: number;
  title?: string;
  description?: string;
  status?: 'idle' | 'working' | 'complete';
  assigned_to?: string;
  priority?: number;
  tags?: string[];
  parent_task_id?: number;
  queue_name?: string;
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
  status?: 'idle' | 'working' | 'complete' | ('idle' | 'working' | 'complete')[];
  exclude_status?: ('idle' | 'working' | 'complete')[];
  include_archived?: boolean;
  include_description?: boolean;
  limit?: number;
  offset?: number;
  queue_name?: string;
  parent_task_id?: number;
  exclude_subtasks?: boolean;
}

export interface GetMyQueueParams {
  agent_name: string;
  include_description?: boolean;
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

export interface GetCommentParams {
  id: number;
}

export interface MoveCommentParams {
  comment_id: number;
  to_task_id: number;
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

// Subtask handler parameter types
export interface CreateSubtaskParams {
  parent_task_id: number;
  title: string;
  description?: string;
  assigned_to?: string;
  created_by: string;
  priority?: number;
  tags?: string[];
  queue_name?: string;
}

export interface GetSubtasksParams {
  parent_task_id: number;
  recursive?: boolean;
  include_archived?: boolean;
}

export interface GetTaskWithSubtasksParams {
  task_id: number;
  recursive?: boolean;
}

export interface MoveSubtaskParams {
  subtask_id: number;
  new_parent_id?: number;
}

// Queue handler parameter types
export interface ListQueuesParams {
  // No parameters
}

export interface GetQueueStatsParams {
  queue_name: string;
}

export interface AddTaskToQueueParams {
  task_id: number;
  queue_name: string;
}

export interface RemoveTaskFromQueueParams {
  task_id: number;
}

export interface MoveTaskToQueueParams {
  task_id: number;
  new_queue_name: string;
}

export interface GetQueueTasksParams {
  queue_name: string;
  assigned_to?: string;
  status?: 'idle' | 'working' | 'complete' | ('idle' | 'working' | 'complete')[];
  exclude_status?: ('idle' | 'working' | 'complete')[];
  parent_task_id?: number | null;
  exclude_subtasks?: boolean;
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ClearQueueParams {
  queue_name: string;
}
