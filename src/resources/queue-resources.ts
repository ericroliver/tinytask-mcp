/**
 * Queue resource handler functions
 */

import { TaskService } from '../services/index.js';
import { QueueService } from '../services/queue-service.js';

export async function handleQueueResource(
  taskService: TaskService,
  params: { agent_name: string }
) {
  try {
    const tasks = taskService.getQueue(params.agent_name);

    return {
      contents: [
        {
          uri: `queue://${encodeURIComponent(params.agent_name)}`,
          mimeType: 'application/json',
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
    throw new Error(
      `Failed to retrieve queue: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function handleQueueSummaryResource(
  taskService: TaskService,
  params: { agent_name: string }
) {
  try {
    const tasks = taskService.getQueue(params.agent_name);

    const summary = {
      agent: params.agent_name,
      total: tasks.length,
      by_status: {
        idle: tasks.filter((t) => t.status === 'idle').length,
        working: tasks.filter((t) => t.status === 'working').length,
      },
      by_priority: {
        high: tasks.filter((t) => t.priority > 5).length,
        medium: tasks.filter((t) => t.priority >= 0 && t.priority <= 5).length,
        low: tasks.filter((t) => t.priority < 0).length,
      },
    };

    return {
      contents: [
        {
          uri: `queue://${encodeURIComponent(params.agent_name)}/summary`,
          mimeType: 'application/json',
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to retrieve queue summary: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function handleQueueListResource(queueService: QueueService) {
  try {
    const queues = queueService.listQueues();

    if (queues.length === 0) {
      return {
        contents: [
          {
            uri: 'queue://list',
            mimeType: 'text/plain',
            text: 'No queues found.\n',
          },
        ],
      };
    }

    // Get stats for each queue to show counts
    let text = 'Active Queues:\n\n';
    for (const queueName of queues) {
      const stats = queueService.getQueueStats(queueName);
      text += `${queueName}:\n`;
      text += `  Total Tasks: ${stats.total_tasks}\n`;
      text += `  Assigned: ${stats.assigned}, Unassigned: ${stats.unassigned}\n`;
      text += `  Status: ${stats.by_status.idle} idle, ${stats.by_status.working} working, ${stats.by_status.complete} complete\n`;
      if (stats.agents.length > 0) {
        text += `  Agents: ${stats.agents.join(', ')}\n`;
      }
      text += '\n';
    }

    return {
      contents: [
        {
          uri: 'queue://list',
          mimeType: 'text/plain',
          text: text,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to list queues: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function handleQueueStatsResource(
  queueService: QueueService,
  params: { queue_name: string }
) {
  try {
    const stats = queueService.getQueueStats(params.queue_name);

    let text = `Queue: ${stats.queue_name}\n\n`;
    text += `Total Tasks: ${stats.total_tasks}\n`;
    text += `Assigned: ${stats.assigned}\n`;
    text += `Unassigned: ${stats.unassigned}\n\n`;
    text += `By Status:\n`;
    text += `  Idle: ${stats.by_status.idle}\n`;
    text += `  Working: ${stats.by_status.working}\n`;
    text += `  Complete: ${stats.by_status.complete}\n\n`;

    if (stats.agents.length > 0) {
      text += `Agents (${stats.agents.length}):\n`;
      for (const agent of stats.agents) {
        text += `  - ${agent}\n`;
      }
    } else {
      text += 'No agents assigned to this queue.\n';
    }

    return {
      contents: [
        {
          uri: `queue://stats/${encodeURIComponent(params.queue_name)}`,
          mimeType: 'text/plain',
          text: text,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to retrieve queue stats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function handleQueueTasksResource(
  queueService: QueueService,
  params: { queue_name: string }
) {
  try {
    const tasks = queueService.getQueueTasks(params.queue_name, {});

    if (tasks.length === 0) {
      return {
        contents: [
          {
            uri: `queue://tasks/${encodeURIComponent(params.queue_name)}`,
            mimeType: 'text/plain',
            text: `No tasks found in queue: ${params.queue_name}\n`,
          },
        ],
      };
    }

    let text = `Queue: ${params.queue_name}\n`;
    text += `Total Tasks: ${tasks.length}\n\n`;

    // Group by status
    const idle = tasks.filter((t) => t.status === 'idle');
    const working = tasks.filter((t) => t.status === 'working');
    const complete = tasks.filter((t) => t.status === 'complete');

    if (idle.length > 0) {
      text += `Idle (${idle.length}):\n`;
      for (const task of idle) {
        text += `  #${task.id}: ${task.title}`;
        if (task.assigned_to) {
          text += ` (${task.assigned_to})`;
        } else {
          text += ' (unassigned)';
        }
        text += ` [priority: ${task.priority}]\n`;
      }
      text += '\n';
    }

    if (working.length > 0) {
      text += `Working (${working.length}):\n`;
      for (const task of working) {
        text += `  #${task.id}: ${task.title}`;
        if (task.assigned_to) {
          text += ` (${task.assigned_to})`;
        }
        text += ` [priority: ${task.priority}]\n`;
      }
      text += '\n';
    }

    if (complete.length > 0) {
      text += `Complete (${complete.length}):\n`;
      for (const task of complete) {
        text += `  #${task.id}: ${task.title}`;
        if (task.assigned_to) {
          text += ` (${task.assigned_to})`;
        }
        text += ` [priority: ${task.priority}]\n`;
      }
      text += '\n';
    }

    return {
      contents: [
        {
          uri: `queue://tasks/${encodeURIComponent(params.queue_name)}`,
          mimeType: 'text/plain',
          text: text,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to retrieve queue tasks: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
