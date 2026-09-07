/**
 * Queue tool handler functions
 */

import { QueueService } from '../services/index.js';

export async function listQueuesHandler(queueService: QueueService) {
  try {
    const queues = queueService.listQueues();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              count: queues.length,
              queues: queues,
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
          text: `Error listing queues: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getQueueStatsHandler(
  queueService: QueueService,
  params: { queue_name: string }
) {
  try {
    const stats = queueService.getQueueStats(params.queue_name);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error retrieving queue stats: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function addTaskToQueueHandler(
  queueService: QueueService,
  params: { task_id: number; queue_name: string }
) {
  try {
    const task = queueService.addTaskToQueue(params.task_id, params.queue_name);

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
          text: `Error adding task to queue: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function removeTaskFromQueueHandler(
  queueService: QueueService,
  params: { task_id: number }
) {
  try {
    const task = queueService.removeTaskFromQueue(params.task_id);

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
          text: `Error removing task from queue: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function moveTaskToQueueHandler(
  queueService: QueueService,
  params: { task_id: number; new_queue_name: string }
) {
  try {
    const task = queueService.moveTaskToQueue(params.task_id, params.new_queue_name);

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
          text: `Error moving task to queue: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getQueueTasksHandler(
  queueService: QueueService,
  params: {
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
) {
  try {
    const tasks = queueService.getQueueTasks(params.queue_name, {
      assigned_to: params.assigned_to,
      status: params.status,
      exclude_status: params.exclude_status,
      parent_task_id: params.parent_task_id,
      exclude_subtasks: params.exclude_subtasks,
      include_archived: params.include_archived || false,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              queue_name: params.queue_name,
              count: tasks.length,
              filters: {
                assigned_to: params.assigned_to,
                status: params.status,
                exclude_status: params.exclude_status,
                parent_task_id: params.parent_task_id,
                exclude_subtasks: params.exclude_subtasks,
                include_archived: params.include_archived || false,
                limit: params.limit,
                offset: params.offset,
              },
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
          text: `Error retrieving queue tasks: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function clearQueueHandler(
  queueService: QueueService,
  params: { queue_name: string }
) {
  try {
    const count = queueService.clearQueue(params.queue_name);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              queue_name: params.queue_name,
              tasks_cleared: count,
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
          text: `Error clearing queue: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
