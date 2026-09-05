import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface CreateTaskParams {
  title: string;
  description?: string;
  assigned_to?: string;
  created_by: string;
  priority?: number;
  tags?: string[];
  parent_task_id?: number;
  queue_name?: string;
  auto_promote?: boolean;
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
  auto_promote?: boolean;
}

export interface TaskFilters {
  assigned_to?: string;
  status?: 'idle' | 'working' | 'complete' | ('idle' | 'working' | 'complete')[];
  exclude_status?: ('idle' | 'working' | 'complete')[];
  include_archived?: boolean;
  limit?: number;
  offset?: number;
  queue_name?: string;
  parent_task_id?: number;
  exclude_subtasks?: boolean;
}

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

export interface QueueFilters {
  queue_name: string;
  assigned_to?: string;
  status?: 'idle' | 'working' | 'complete' | ('idle' | 'working' | 'complete')[];
  exclude_status?: ('idle' | 'working' | 'complete')[];
  parent_task_id?: number;
  exclude_subtasks?: boolean;
  include_archived?: boolean;
  include_description?: boolean;
  limit?: number;
  offset?: number;
}

export class TinyTaskClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connected: boolean = false;

  constructor(private serverUrl: string) {
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));

    this.client = new Client(
      {
        name: 'tinytask-cli',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.client.connect(this.transport);
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to TinyTask server at ${this.serverUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
    } catch (error) {
      // Log but don't throw on disconnect errors
      console.error('Error disconnecting:', error);
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }
  }

  private parseResult<T>(result: CallToolResult, allowVoid = false): T {
    if (result.isError) {
      const errorText = result.content[0]?.text || 'Unknown error';
      throw new Error(errorText);
    }

    const text = result.content[0]?.text;
    if (!text) {
      throw new Error('Empty response from server');
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      // For void operations, a simple success message is acceptable
      if (allowVoid && text.includes('success')) {
        return undefined as T;
      }
      throw new Error(
        `Failed to parse server response: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Task Operations
  async createTask(params: CreateTaskParams): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'create_task',
      arguments: params,
    });
    return this.parseResult(result);
  }

  async getTask(id: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_task',
      arguments: { id },
    });
    return this.parseResult(result);
  }

  async updateTask(params: UpdateTaskParams): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'update_task',
      arguments: params,
    });
    return this.parseResult(result);
  }

  async deleteTask(id: number): Promise<void> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'delete_task',
      arguments: { id },
    });
    this.parseResult(result, true);
  }

  async archiveTask(id: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'archive_task',
      arguments: { id },
    });
    return this.parseResult(result);
  }

  async listTasks(filters?: TaskFilters): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'list_tasks',
      arguments: filters || {},
    });
    return this.parseResult(result);
  }

  async getMyQueue(agentName: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_my_queue',
      arguments: { agent_name: agentName },
    });
    return this.parseResult(result);
  }

  async signupForTask(agentName: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'signup_for_task',
      arguments: { agent_name: agentName },
    });
    return this.parseResult(result);
  }

  async moveTask(
    taskId: number,
    currentAgent: string,
    newAgent: string,
    comment: string
  ): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'move_task',
      arguments: {
        task_id: taskId,
        current_agent: currentAgent,
        new_agent: newAgent,
        comment,
      },
    });
    return this.parseResult(result);
  }

  // Comment Operations
  async addComment(taskId: number, content: string, createdBy?: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'add_comment',
      arguments: {
        task_id: taskId,
        content,
        created_by: createdBy,
      },
    });
    return this.parseResult(result);
  }

  async listComments(taskId: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'list_comments',
      arguments: { task_id: taskId },
    });
    return this.parseResult(result);
  }

  async getTaskHistory(taskId: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_task_history',
      arguments: { task_id: taskId },
    });
    return this.parseResult(result);
  }

  async updateComment(id: number, content: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'update_comment',
      arguments: { id, content },
    });
    return this.parseResult(result);
  }

  async deleteComment(id: number): Promise<void> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'delete_comment',
      arguments: { id },
    });
    this.parseResult(result, true);
  }

  async getComment(id: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_comment',
      arguments: { id },
    });
    return this.parseResult(result);
  }

  async moveComment(commentId: number, toTaskId: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'move_comment',
      arguments: { comment_id: commentId, to_task_id: toTaskId },
    });
    return this.parseResult(result);
  }

  // Link Operations
  async addLink(
    taskId: number,
    url: string,
    description?: string,
    createdBy?: string
  ): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'add_link',
      arguments: {
        task_id: taskId,
        url,
        description,
        created_by: createdBy,
      },
    });
    return this.parseResult(result);
  }

  async listLinks(taskId: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'list_links',
      arguments: { task_id: taskId },
    });
    return this.parseResult(result);
  }

  async updateLink(id: number, updates: { url?: string; description?: string }): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'update_link',
      arguments: { id, ...updates },
    });
    return this.parseResult(result);
  }

  async deleteLink(id: number): Promise<void> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'delete_link',
      arguments: { id },
    });
    this.parseResult(result);
  }

  // Subtask Operations
  async createSubtask(params: CreateSubtaskParams): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'create_subtask',
      arguments: params,
    });
    return this.parseResult(result);
  }

  async getSubtasks(params: GetSubtasksParams): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_subtasks',
      arguments: params,
    });
    return this.parseResult(result);
  }

  async getTaskWithSubtasks(taskId: number, recursive = false): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_task_with_subtasks',
      arguments: { task_id: taskId, recursive },
    });
    return this.parseResult(result);
  }

  async moveSubtask(subtaskId: number, newParentId?: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'move_subtask',
      arguments: {
        subtask_id: subtaskId,
        new_parent_id: newParentId,
      },
    });
    return this.parseResult(result);
  }

  // Queue Operations
  async listQueues(): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'list_queues',
      arguments: {},
    });
    return this.parseResult(result);
  }

  async getQueueStats(queueName: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_queue_stats',
      arguments: { queue_name: queueName },
    });
    return this.parseResult(result);
  }

  async addTaskToQueue(taskId: number, queueName: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'add_task_to_queue',
      arguments: { task_id: taskId, queue_name: queueName },
    });
    return this.parseResult(result);
  }

  async removeTaskFromQueue(taskId: number): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'remove_task_from_queue',
      arguments: { task_id: taskId },
    });
    return this.parseResult(result);
  }

  async moveTaskToQueue(taskId: number, newQueueName: string): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'move_task_to_queue',
      arguments: { task_id: taskId, new_queue_name: newQueueName },
    });
    return this.parseResult(result);
  }

  async getQueueTasks(filters: QueueFilters): Promise<unknown> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_queue_tasks',
      arguments: filters,
    });
    return this.parseResult(result);
  }

  async clearQueue(queueName: string): Promise<void> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'clear_queue',
      arguments: { queue_name: queueName },
    });
    this.parseResult(result, true);
  }
}
