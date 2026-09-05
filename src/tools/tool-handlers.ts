/**
 * MCP tool handlers using SDK 0.5.0 API
 * Implements ListTools and CallTool request handlers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TaskService, CommentService, LinkService, QueueService } from '../services/index.js';
import { toolDefinitions, toolSchemas } from './tool-definitions.js';
import { logger } from '../utils/index.js';
import {
  createTaskHandler,
  updateTaskHandler,
  getTaskHandler,
  getTaskHistoryHandler,
  deleteTaskHandler,
  archiveTaskHandler,
  listTasksHandler,
  getMyQueueHandler,
  signupForTaskHandler,
  moveTaskHandler,
  createSubtaskHandler,
  getSubtasksHandler,
  getTaskWithSubtasksHandler,
  moveSubtaskHandler,
} from './task-tools.js';
import {
  addCommentHandler,
  updateCommentHandler,
  deleteCommentHandler,
  listCommentsHandler,
  getCommentHandler,
  moveCommentHandler,
} from './comment-tools.js';
import {
  addLinkHandler,
  updateLinkHandler,
  deleteLinkHandler,
  listLinksHandler,
} from './link-tools.js';
import {
  listQueuesHandler,
  getQueueStatsHandler,
  addTaskToQueueHandler,
  removeTaskFromQueueHandler,
  moveTaskToQueueHandler,
  getQueueTasksHandler,
  clearQueueHandler,
} from './queue-tools.js';
import type {
  CreateTaskParams,
  UpdateTaskParams,
  GetTaskParams,
  GetTaskHistoryParams,
  DeleteTaskParams,
  ArchiveTaskParams,
  ListTasksParams,
  GetMyQueueParams,
  SignupForTaskParams,
  MoveTaskParams,
  CreateSubtaskParams,
  GetSubtasksParams,
  GetTaskWithSubtasksParams,
  MoveSubtaskParams,
  AddCommentParams,
  UpdateCommentParams,
  DeleteCommentParams,
  ListCommentsParams,
  GetCommentParams,
  MoveCommentParams,
  AddLinkParams,
  UpdateLinkParams,
  DeleteLinkParams,
  ListLinksParams,
  GetQueueStatsParams,
  AddTaskToQueueParams,
  RemoveTaskFromQueueParams,
  MoveTaskToQueueParams,
  GetQueueTasksParams,
  ClearQueueParams,
} from './handler-types.js';

/**
 * Register MCP tool handlers with the server
 */
export function registerToolHandlers(
  server: Server,
  taskService: TaskService,
  commentService: CommentService,
  linkService: LinkService,
  queueService: QueueService
): void {
  // Handler for tools/list request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions,
    };
  });

  // Handler for tools/call request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    logger.debug(`Tool call received: ${name}`);
    logger.trace('Tool call arguments', { name, args });

    try {
      // Validate arguments against schema
      const schema = toolSchemas[name as keyof typeof toolSchemas];
      if (!schema) {
        logger.warn(`Unknown tool requested: ${name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
      }

      // Parse and validate arguments
      const validatedArgs = schema.parse(args || {});
      logger.debug(`Tool arguments validated: ${name}`);

      // Route to appropriate handler
      let result;
      switch (name) {
        // Task tools
        case 'create_task':
          result = await createTaskHandler(taskService, validatedArgs as CreateTaskParams);
          break;
        case 'update_task':
          result = await updateTaskHandler(taskService, validatedArgs as UpdateTaskParams);
          break;
        case 'get_task':
          result = await getTaskHandler(taskService, validatedArgs as GetTaskParams);
          break;
        case 'get_task_history':
          result = await getTaskHistoryHandler(taskService, validatedArgs as GetTaskHistoryParams);
          break;
        case 'delete_task':
          result = await deleteTaskHandler(taskService, validatedArgs as DeleteTaskParams);
          break;
        case 'archive_task':
          result = await archiveTaskHandler(taskService, validatedArgs as ArchiveTaskParams);
          break;
        case 'list_tasks':
          result = await listTasksHandler(taskService, validatedArgs as ListTasksParams);
          break;
        case 'get_my_queue':
          result = await getMyQueueHandler(taskService, validatedArgs as GetMyQueueParams);
          break;
        case 'signup_for_task':
          result = await signupForTaskHandler(taskService, validatedArgs as SignupForTaskParams);
          break;
        case 'move_task':
          result = await moveTaskHandler(taskService, validatedArgs as MoveTaskParams);
          break;

        // Subtask tools
        case 'create_subtask':
          result = await createSubtaskHandler(taskService, validatedArgs as CreateSubtaskParams);
          break;
        case 'get_subtasks':
          result = await getSubtasksHandler(taskService, validatedArgs as GetSubtasksParams);
          break;
        case 'get_task_with_subtasks':
          result = await getTaskWithSubtasksHandler(taskService, validatedArgs as GetTaskWithSubtasksParams);
          break;
        case 'move_subtask':
          result = await moveSubtaskHandler(taskService, validatedArgs as MoveSubtaskParams);
          break;

        // Comment tools
        case 'add_comment':
          result = await addCommentHandler(commentService, validatedArgs as AddCommentParams);
          break;
        case 'update_comment':
          result = await updateCommentHandler(commentService, validatedArgs as UpdateCommentParams);
          break;
        case 'delete_comment':
          result = await deleteCommentHandler(commentService, validatedArgs as DeleteCommentParams);
          break;
        case 'list_comments':
          result = await listCommentsHandler(commentService, validatedArgs as ListCommentsParams);
          break;
        case 'get_comment':
          result = await getCommentHandler(commentService, validatedArgs as GetCommentParams);
          break;
        case 'move_comment':
          result = await moveCommentHandler(commentService, validatedArgs as MoveCommentParams);
          break;

        // Link tools
        case 'add_link':
          result = await addLinkHandler(linkService, validatedArgs as AddLinkParams);
          break;
        case 'update_link':
          result = await updateLinkHandler(linkService, validatedArgs as UpdateLinkParams);
          break;
        case 'delete_link':
          result = await deleteLinkHandler(linkService, validatedArgs as DeleteLinkParams);
          break;
        case 'list_links':
          result = await listLinksHandler(linkService, validatedArgs as ListLinksParams);
          break;

        // Queue tools
        case 'list_queues':
          result = await listQueuesHandler(queueService);
          break;
        case 'get_queue_stats':
          result = await getQueueStatsHandler(queueService, validatedArgs as GetQueueStatsParams);
          break;
        case 'add_task_to_queue':
          result = await addTaskToQueueHandler(queueService, validatedArgs as AddTaskToQueueParams);
          break;
        case 'remove_task_from_queue':
          result = await removeTaskFromQueueHandler(queueService, validatedArgs as RemoveTaskFromQueueParams);
          break;
        case 'move_task_to_queue':
          result = await moveTaskToQueueHandler(queueService, validatedArgs as MoveTaskToQueueParams);
          break;
        case 'get_queue_tasks':
          result = await getQueueTasksHandler(queueService, validatedArgs as GetQueueTasksParams);
          break;
        case 'clear_queue':
          result = await clearQueueHandler(queueService, validatedArgs as ClearQueueParams);
          break;

        default:
          logger.warn(`Unknown tool in switch: ${name}`);
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ TOOL EXECUTION COMPLETED: ${name}`, {
        duration: `${duration}ms`,
        resultType: result.isError ? 'error' : 'success',
        contentCount: result.content?.length || 0,
        timestamp: new Date().toISOString(),
      });
      logger.debug('Tool execution result details', { name, result });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Tool execution failed: ${name}`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        args,
        duration: `${duration}ms`,
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool ${name}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });
}
