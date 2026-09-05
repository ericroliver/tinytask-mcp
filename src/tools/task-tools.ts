/**
 * Task tool handler functions
 */

import { TaskService } from '../services/index.js';

export async function createTaskHandler(
  taskService: TaskService,
  params: {
    title: string;
    description?: string;
    assigned_to?: string;
    created_by: string;
    priority?: number;
    tags?: string[];
    parent_task_id?: number;
    queue_name?: string;
    blocked_by_task_id?: number;
    auto_promote?: boolean;
  }
) {
  try {
    const task = taskService.create(params);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function createSubtaskHandler(
  taskService: TaskService,
  params: {
    parent_task_id: number;
    title: string;
    description?: string;
    assigned_to?: string;
    created_by: string;
    priority?: number;
    tags?: string[];
    queue_name?: string;
  }
) {
  try {
    // Validate parent exists
    const parent = taskService.get(params.parent_task_id);
    if (!parent) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Parent task not found: ${params.parent_task_id}`,
          },
        ],
        isError: true,
      };
    }

    // Create subtask using createSubtask service method
    const subtask = taskService.createSubtask(params.parent_task_id, {
      title: params.title,
      description: params.description,
      assigned_to: params.assigned_to,
      created_by: params.created_by,
      priority: params.priority,
      tags: params.tags,
      queue_name: params.queue_name,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(subtask, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating subtask: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getSubtasksHandler(
  taskService: TaskService,
  params: {
    parent_task_id: number;
    recursive?: boolean;
    include_archived?: boolean;
  }
) {
  try {
    const subtasks = taskService.getSubtasks(
      params.parent_task_id,
      params.recursive || false,
      params.include_archived || false
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              parent_task_id: params.parent_task_id,
              recursive: params.recursive || false,
              count: subtasks.length,
              subtasks: subtasks,
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
          text: `Error retrieving subtasks: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getTaskWithSubtasksHandler(
  taskService: TaskService,
  params: {
    task_id: number;
    recursive?: boolean;
  }
) {
  try {
    const task = taskService.getTaskWithSubtasks(
      params.task_id,
      params.recursive || false
    );

    if (!task) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Task not found: ${params.task_id}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error retrieving task with subtasks: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function moveSubtaskHandler(
  taskService: TaskService,
  params: {
    subtask_id: number;
    new_parent_id?: number;
  }
) {
  try {
    // new_parent_id can be undefined (to make top-level) or a number
    const newParentId = params.new_parent_id === undefined ? null : params.new_parent_id;
    
    const task = taskService.moveSubtask(params.subtask_id, newParentId);

    const message = newParentId === null
      ? `Task #${params.subtask_id} moved to top-level (no parent)`
      : `Task #${params.subtask_id} moved to parent #${newParentId}`;

    return {
      content: [
        {
          type: 'text' as const,
          text: `${message}\n\n${JSON.stringify(task, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving subtask: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function updateTaskHandler(
  taskService: TaskService,
  params: {
    id: number;
    title?: string;
    description?: string;
    status?: 'idle' | 'working' | 'complete';
    assigned_to?: string;
    priority?: number;
    tags?: string[];
    parent_task_id?: number;
    queue_name?: string;
    blocked_by_task_id?: number | null;
    auto_promote?: boolean;
    updated_by?: string;
  }
) {
  try {
    const { id, ...updates } = params;
    const task = taskService.update(id, updates);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error updating task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getTaskHistoryHandler(taskService: TaskService, params: { task_id: number }) {
  try {
    const history = taskService.getHistory(params.task_id);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(history, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting task history: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getTaskHandler(taskService: TaskService, params: { id: number }) {
  try {
    const task = taskService.get(params.id, true); // Include comments and links
    if (!task) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Task not found: ${params.id}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error retrieving task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function deleteTaskHandler(taskService: TaskService, params: { id: number }) {
  try {
    taskService.delete(params.id);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `Task ${params.id} deleted successfully`,
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
          text: `Error deleting task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function archiveTaskHandler(taskService: TaskService, params: { id: number }) {
  try {
    const task = taskService.archive(params.id);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error archiving task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function listTasksHandler(
  taskService: TaskService,
  params: {
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
) {
  try {
    const tasks = taskService.list(params);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              count: tasks.length,
              tasks: tasks,
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
          text: `Error listing tasks: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getMyQueueHandler(
  taskService: TaskService,
  params: { agent_name: string; include_description?: boolean }
) {
  try {
    const tasks = taskService.getQueue(params.agent_name, params.include_description);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              agent: params.agent_name,
              count: tasks.length,
              tasks: tasks,
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
          text: `Error retrieving queue: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function signupForTaskHandler(
  taskService: TaskService,
  params: { agent_name: string }
) {
  try {
    const task = taskService.signupForTask(params.agent_name);
    
    if (!task) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No idle tasks available in queue for agent: ${params.agent_name}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task #${task.id} claimed and set to working status\n\n${JSON.stringify(task, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error signing up for task: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function moveTaskHandler(
  taskService: TaskService,
  params: {
    task_id: number;
    current_agent: string;
    new_agent: string;
    comment: string;
  }
) {
  try {
    const task = taskService.moveTask(
      params.task_id,
      params.current_agent,
      params.new_agent,
      params.comment
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }
}
