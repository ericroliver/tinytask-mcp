/**
 * OpenAPI 3.0 specification generator for TinyTask REST adapter
 *
 * Manually constructs an OpenAPI 3.0 spec from the REST endpoints defined in rest.ts,
 * using Zod input schemas (from tool-definitions.ts) and response schemas (from response-schemas.ts).
 *
 * Served at GET /openapi.json
 */

import { z } from 'zod';
import {
  ParsedTaskSchema,
  CommentDataSchema,
  LinkDataSchema,
  TaskWithRelationsSchema,
  TaskWithSubtasksSchema,
  QueueStatsSchema,
  TaskListSchema,
  TaskHistoryListSchema,
  CommentListSchema,
  LinkListSchema,
  StringListSchema,
  DeletedResponseSchema,
  ClearedQueueResponseSchema,
  TaskTransferResponseSchema,
  ErrorResponseSchema,
} from './response-schemas.js';

// ─── Helpers ────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

/**
 * Convert a Zod schema to a JSON Schema object (OpenAPI-compatible).
 * Handles the Zod types used in our schemas: objects, strings, numbers,
 * booleans, enums, arrays, optionals, nullables, and ZodEffects (coerce).
 */
function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  // Unwrap ZodEffects (used by z.coerce)
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema._def.schema);
  }

  // ZodOptional
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }

  // ZodNullable — OpenAPI 3.0 uses `nullable: true` rather than JSON Schema union types
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { ...inner, nullable: true };
  }

  // ZodDefault
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }

  // ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodTypeAny);

      // Check if required (unwrap ZodEffects, ZodOptional)
      let typeToCheck = value as z.ZodTypeAny;
      if (typeToCheck instanceof z.ZodEffects) {
        typeToCheck = typeToCheck._def.schema;
      }
      if (typeToCheck instanceof z.ZodOptional) {
        let inner = typeToCheck._def.innerType;
        if (inner instanceof z.ZodEffects) {
          inner = inner._def.schema;
        }
        // Nullable + Optional means not required
      } else if (typeToCheck instanceof z.ZodNullable) {
        // Non-optional nullable is still required (value can be null)
        required.push(key);
      } else {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // ZodArray
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
    };
  }

  // ZodString
  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description || undefined };
  }

  // ZodNumber
  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: schema.description || undefined };
  }

  // ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description || undefined };
  }

  // ZodEnum
  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema._def.values,
      description: schema.description || undefined,
    };
  }

  // Fallback
  return { type: 'string' };
}

// ─── Component schemas ──────────────────────────────────────

function buildComponentSchemas(): Record<string, JsonSchema> {
  return {
    ParsedTask: zodToJsonSchema(ParsedTaskSchema),
    CommentData: zodToJsonSchema(CommentDataSchema),
    LinkData: zodToJsonSchema(LinkDataSchema),
    TaskWithRelations: zodToJsonSchema(TaskWithRelationsSchema),
    TaskWithSubtasks: zodToJsonSchema(TaskWithSubtasksSchema),
    QueueStats: zodToJsonSchema(QueueStatsSchema),
    TaskList: zodToJsonSchema(TaskListSchema),
    TaskHistoryList: zodToJsonSchema(TaskHistoryListSchema),
    CommentList: zodToJsonSchema(CommentListSchema),
    LinkList: zodToJsonSchema(LinkListSchema),
    StringList: zodToJsonSchema(StringListSchema),
    DeletedResponse: zodToJsonSchema(DeletedResponseSchema),
    ClearedQueueResponse: zodToJsonSchema(ClearedQueueResponseSchema),
    TaskTransferResponse: zodToJsonSchema(TaskTransferResponseSchema),
    ErrorResponse: zodToJsonSchema(ErrorResponseSchema),
  };
}

// ─── Reusable response builders ─────────────────────────────

function jsonResponse(ref: string, description = 'Successful response'): JsonSchema {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${ref}` },
      },
    },
  };
}

function errorResponse(description = 'Error response'): JsonSchema {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  };
}

function createdResponse(ref: string): JsonSchema {
  return jsonResponse(ref, 'Created successfully');
}

// ─── Input schema builders ──────────────────────────────────

/**
 * Build a request body schema from a Zod object schema.
 * Returns an OpenAPI requestBody object.
 */
function requestBody(schema: z.ZodTypeAny, description = 'Request body'): JsonSchema {
  const jsonSchema = zodToJsonSchema(schema);
  return {
    description,
    required: true,
    content: {
      'application/json': {
        schema: jsonSchema,
      },
    },
  };
}

// ─── Path definitions ───────────────────────────────────────

function buildPaths(): Record<string, Record<string, JsonSchema>> {
  return {
    // ─── Tasks ───────────────────────────────────────────

    '/api/v1/tasks': {
      post: {
        summary: 'Create a task',
        description: 'Create a new task in the system. Maps to MCP tool: create_task.',
        operationId: 'createTask',
        tags: ['Tasks'],
        requestBody: requestBody(
          z.object({
            title: z.string().describe('Task title'),
            description: z.string().optional().describe('Task description'),
            assigned_to: z.string().optional().describe('Agent name to assign to'),
            created_by: z.string().describe('Agent name creating the task (required)'),
            priority: z.number().optional().describe('Priority level (default: 0)'),
            tags: z.array(z.string()).optional().describe('Array of tags'),
            parent_task_id: z.number().optional().describe('Parent task ID (creates subtask)'),
            queue_name: z.string().optional().describe('Queue name'),
            blocked_by_task_id: z.number().optional().describe('ID of task that blocks this task'),
          })
        ),
        responses: {
          '201': createdResponse('ParsedTask'),
          '400': errorResponse('Invalid input'),
        },
      },
      get: {
        summary: 'List tasks',
        description: 'List tasks with optional filters. Maps to MCP tool: list_tasks.',
        operationId: 'listTasks',
        tags: ['Tasks'],
        parameters: [
          { name: 'assigned_to', in: 'query', schema: { type: 'string' }, description: 'Filter by assignee' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['idle', 'working', 'complete'] }, description: 'Filter by status' },
          { name: 'include_archived', in: 'query', schema: { type: 'boolean' }, description: 'Include archived tasks' },
          { name: 'include_description', in: 'query', schema: { type: 'boolean' }, description: 'Include full task descriptions (default: false - omitted to keep responses small)' },
          { name: 'limit', in: 'query', schema: { type: 'number' }, description: 'Max results (default: 100)' },
          { name: 'offset', in: 'query', schema: { type: 'number' }, description: 'Pagination offset' },
          { name: 'queue_name', in: 'query', schema: { type: 'string' }, description: 'Filter by queue name' },
          { name: 'parent_task_id', in: 'query', schema: { type: 'number' }, description: 'Filter by parent task ID' },
          { name: 'exclude_subtasks', in: 'query', schema: { type: 'boolean' }, description: 'Exclude subtasks from results' },
        ],
        responses: {
          '200': jsonResponse('TaskList'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/tasks/{id}': {
      get: {
        summary: 'Get a task',
        description: 'Get a task by ID with all comments and links. Maps to MCP tool: get_task.',
        operationId: 'getTask',
        tags: ['Tasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('TaskWithRelations'),
          '404': errorResponse('Task not found'),
        },
      },
      patch: {
        summary: 'Update a task',
        description: 'Update an existing task. Maps to MCP tool: update_task.',
        operationId: 'updateTask',
        tags: ['Tasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        requestBody: requestBody(
          z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            status: z.enum(['idle', 'working', 'complete']).optional(),
            assigned_to: z.string().optional(),
            priority: z.number().optional(),
            tags: z.array(z.string()).optional(),
            parent_task_id: z.number().optional(),
            queue_name: z.string().optional(),
            blocked_by_task_id: z.number().nullable().optional(),
            auto_promote: z.boolean().optional(),
            updated_by: z.string().optional(),
          })
        ),
        responses: {
          '200': jsonResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
      delete: {
        summary: 'Delete a task',
        description: 'Delete a task by ID. Maps to MCP tool: delete_task.',
        operationId: 'deleteTask',
        tags: ['Tasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('DeletedResponse'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
    },

    '/api/v1/tasks/{id}/history': {
      get: {
        summary: 'Get task history',
        description:
          'Get the audit-trail history for a task: chronological log of field changes with old/new values, acting agent, and timestamps. Maps to MCP tool: get_task_history.',
        operationId: 'getTaskHistory',
        tags: ['Tasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('TaskHistoryList'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
    },

    '/api/v1/tasks/{id}/archive': {
      post: {
        summary: 'Archive a task',
        description: 'Archive a task by ID. Maps to MCP tool: archive_task.',
        operationId: 'archiveTask',
        tags: ['Tasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
    },

    // ─── Subtasks ────────────────────────────────────────

    '/api/v1/tasks/{parentId}/subtasks': {
      post: {
        summary: 'Create a subtask',
        description: 'Create a new subtask under a parent task. Maps to MCP tool: create_subtask.',
        operationId: 'createSubtask',
        tags: ['Subtasks'],
        parameters: [
          { name: 'parentId', in: 'path', required: true, schema: { type: 'number' }, description: 'Parent task ID' },
        ],
        requestBody: requestBody(
          z.object({
            title: z.string().describe('Subtask title'),
            description: z.string().optional(),
            assigned_to: z.string().optional(),
            created_by: z.string().describe('Agent name creating the subtask (required)'),
            priority: z.number().optional(),
            tags: z.array(z.string()).optional(),
            queue_name: z.string().optional(),
          })
        ),
        responses: {
          '201': createdResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Parent task not found'),
        },
      },
      get: {
        summary: 'Get subtasks',
        description: 'Get all subtasks for a parent task. Maps to MCP tool: get_subtasks.',
        operationId: 'getSubtasks',
        tags: ['Subtasks'],
        parameters: [
          { name: 'parentId', in: 'path', required: true, schema: { type: 'number' }, description: 'Parent task ID' },
          { name: 'recursive', in: 'query', schema: { type: 'boolean' }, description: 'Include nested subtasks' },
          { name: 'include_archived', in: 'query', schema: { type: 'boolean' }, description: 'Include archived subtasks' },
        ],
        responses: {
          '200': jsonResponse('TaskList'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/tasks/{id}/hierarchy': {
      get: {
        summary: 'Get task with subtasks',
        description: 'Get a task with all its subtasks in a tree structure. Maps to MCP tool: get_task_with_subtasks.',
        operationId: 'getTaskHierarchy',
        tags: ['Subtasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
          { name: 'recursive', in: 'query', schema: { type: 'boolean' }, description: 'Include nested subtasks (default: true)' },
        ],
        responses: {
          '200': jsonResponse('TaskWithSubtasks'),
          '404': errorResponse('Task not found'),
        },
      },
    },

    '/api/v1/tasks/{id}/parent': {
      patch: {
        summary: 'Move subtask',
        description: 'Move a subtask to a different parent or make it a top-level task. Maps to MCP tool: move_subtask.',
        operationId: 'moveSubtask',
        tags: ['Subtasks'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Subtask ID' },
        ],
        requestBody: requestBody(
          z.object({
            new_parent_id: z.number().nullable().optional().describe('New parent task ID (null to make top-level)'),
          })
        ),
        responses: {
          '200': jsonResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
    },

    // ─── Agent workflow ──────────────────────────────────

    '/api/v1/agents/{name}/queue': {
      get: {
        summary: 'Get agent queue',
        description: 'Get all open tasks assigned to a specific agent. Maps to MCP tool: get_my_queue.',
        operationId: 'getAgentQueue',
        tags: ['Agents'],
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Agent name' },
          { name: 'include_description', in: 'query', schema: { type: 'boolean' }, description: 'Include full task descriptions (default: false - omitted to keep responses small)' },
        ],
        responses: {
          '200': jsonResponse('TaskList'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/agents/{name}/signup': {
      post: {
        summary: 'Signup for a task',
        description: 'Claim the highest priority idle task from the agent queue and mark it as working. Maps to MCP tool: signup_for_task.',
        operationId: 'signupForTask',
        tags: ['Agents'],
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Agent name' },
        ],
        requestBody: {
          description: 'Optional — no body fields required',
          required: false,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '200': jsonResponse('ParsedTask'),
          '404': errorResponse('No idle tasks available'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/tasks/{id}/transfer': {
      post: {
        summary: 'Transfer task between agents',
        description: 'Transfer a task to another agent with status reset to idle and add handoff comment. Maps to MCP tool: move_task.',
        operationId: 'transferTask',
        tags: ['Agents'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        requestBody: requestBody(
          z.object({
            current_agent: z.string().describe('Current agent (for verification)'),
            new_agent: z.string().describe('Agent to transfer to'),
            comment: z.string().describe('Handoff message/context'),
          })
        ),
        responses: {
          '200': jsonResponse('TaskTransferResponse'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
    },

    // ─── Queues ──────────────────────────────────────────

    '/api/v1/queues': {
      get: {
        summary: 'List queues',
        description: 'List all queue names currently in use. Maps to MCP tool: list_queues.',
        operationId: 'listQueues',
        tags: ['Queues'],
        responses: {
          '200': jsonResponse('StringList'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/queues/{name}/stats': {
      get: {
        summary: 'Get queue stats',
        description: 'Get statistics for a specific queue. Maps to MCP tool: get_queue_stats.',
        operationId: 'getQueueStats',
        tags: ['Queues'],
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Queue name' },
        ],
        responses: {
          '200': jsonResponse('QueueStats'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/queues/{name}/tasks': {
      post: {
        summary: 'Add task to queue',
        description: 'Add an existing task to a queue. Maps to MCP tool: add_task_to_queue.',
        operationId: 'addTaskToQueue',
        tags: ['Queues'],
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Queue name' },
        ],
        requestBody: requestBody(
          z.object({
            task_id: z.number().describe('Task ID to add'),
          })
        ),
        responses: {
          '200': jsonResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
      get: {
        summary: 'Get queue tasks',
        description: 'Get all tasks in a queue with optional filters. Maps to MCP tool: get_queue_tasks.',
        operationId: 'getQueueTasks',
        tags: ['Queues'],
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Queue name' },
          { name: 'assigned_to', in: 'query', schema: { type: 'string' }, description: 'Filter by assignee' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['idle', 'working', 'complete'] }, description: 'Filter by status' },
          { name: 'parent_task_id', in: 'query', schema: { type: 'number' }, description: 'Filter by parent task ID' },
          { name: 'exclude_subtasks', in: 'query', schema: { type: 'boolean' }, description: 'Exclude subtasks' },
          { name: 'include_archived', in: 'query', schema: { type: 'boolean' }, description: 'Include archived tasks' },
          { name: 'limit', in: 'query', schema: { type: 'number' }, description: 'Max results' },
          { name: 'offset', in: 'query', schema: { type: 'number' }, description: 'Pagination offset' },
        ],
        responses: {
          '200': jsonResponse('TaskList'),
          '400': errorResponse(),
        },
      },
      delete: {
        summary: 'Clear queue',
        description: 'Remove all tasks from a queue. Maps to MCP tool: clear_queue.',
        operationId: 'clearQueue',
        tags: ['Queues'],
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, description: 'Queue name' },
        ],
        responses: {
          '200': jsonResponse('ClearedQueueResponse'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/tasks/{id}/queue': {
      delete: {
        summary: 'Remove task from queue',
        description: 'Remove a task from its queue. Maps to MCP tool: remove_task_from_queue.',
        operationId: 'removeTaskFromQueue',
        tags: ['Queues'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
      patch: {
        summary: 'Move task to queue',
        description: 'Move a task from one queue to another. Maps to MCP tool: move_task_to_queue.',
        operationId: 'moveTaskToQueue',
        tags: ['Queues'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        requestBody: requestBody(
          z.object({
            new_queue_name: z.string().describe('New queue name to move task to'),
          })
        ),
        responses: {
          '200': jsonResponse('ParsedTask'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
    },

    // ─── Comments ────────────────────────────────────────

    '/api/v1/tasks/{id}/comments': {
      post: {
        summary: 'Add comment',
        description: 'Add a comment to a task. Maps to MCP tool: add_comment.',
        operationId: 'addComment',
        tags: ['Comments'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        requestBody: requestBody(
          z.object({
            content: z.string().describe('Comment text'),
            created_by: z.string().optional().describe('Agent name'),
          })
        ),
        responses: {
          '201': createdResponse('CommentData'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
      get: {
        summary: 'List comments',
        description: 'List all comments for a task. Maps to MCP tool: list_comments.',
        operationId: 'listComments',
        tags: ['Comments'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('CommentList'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/comments/{id}': {
      patch: {
        summary: 'Update comment',
        description: 'Update an existing comment. Maps to MCP tool: update_comment.',
        operationId: 'updateComment',
        tags: ['Comments'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Comment ID' },
        ],
        requestBody: requestBody(
          z.object({
            content: z.string().describe('New comment text'),
          })
        ),
        responses: {
          '200': jsonResponse('CommentData'),
          '400': errorResponse(),
          '404': errorResponse('Comment not found'),
        },
      },
      delete: {
        summary: 'Delete comment',
        description: 'Delete a comment by ID. Maps to MCP tool: delete_comment.',
        operationId: 'deleteComment',
        tags: ['Comments'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Comment ID' },
        ],
        responses: {
          '200': jsonResponse('DeletedResponse'),
          '400': errorResponse(),
          '404': errorResponse('Comment not found'),
        },
      },
    },

    // ─── Links ───────────────────────────────────────────

    '/api/v1/tasks/{id}/links': {
      post: {
        summary: 'Add link',
        description: 'Add a link/artifact reference to a task. Maps to MCP tool: add_link.',
        operationId: 'addLink',
        tags: ['Links'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        requestBody: requestBody(
          z.object({
            url: z.string().describe('Link URL or path'),
            description: z.string().optional().describe('Description of the artifact'),
            created_by: z.string().optional().describe('Agent name'),
          })
        ),
        responses: {
          '201': createdResponse('LinkData'),
          '400': errorResponse(),
          '404': errorResponse('Task not found'),
        },
      },
      get: {
        summary: 'List links',
        description: 'List all links for a task. Maps to MCP tool: list_links.',
        operationId: 'listLinks',
        tags: ['Links'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Task ID' },
        ],
        responses: {
          '200': jsonResponse('LinkList'),
          '400': errorResponse(),
        },
      },
    },

    '/api/v1/links/{id}': {
      patch: {
        summary: 'Update link',
        description: 'Update an existing link. Maps to MCP tool: update_link.',
        operationId: 'updateLink',
        tags: ['Links'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Link ID' },
        ],
        requestBody: requestBody(
          z.object({
            url: z.string().optional().describe('New URL'),
            description: z.string().optional().describe('New description'),
          })
        ),
        responses: {
          '200': jsonResponse('LinkData'),
          '400': errorResponse(),
          '404': errorResponse('Link not found'),
        },
      },
      delete: {
        summary: 'Delete link',
        description: 'Delete a link by ID. Maps to MCP tool: delete_link.',
        operationId: 'deleteLink',
        tags: ['Links'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'number' }, description: 'Link ID' },
        ],
        responses: {
          '200': jsonResponse('DeletedResponse'),
          '400': errorResponse(),
          '404': errorResponse('Link not found'),
        },
      },
    },
  };
}

// ─── Full spec assembly ─────────────────────────────────────

/**
 * Generate the complete OpenAPI 3.0 specification for the TinyTask REST adapter.
 */
export function generateOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'TinyTask REST API',
      description:
        'Thin REST adapter for TinyTask MCP server. Maps all MCP tools to RESTful endpoints for Shogun test coverage. Each endpoint delegates directly to the service layer with no additional business logic.',
      version: '1.0.0',
      contact: {
        name: 'TinyTask',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Relative to server host',
      },
    ],
    tags: [
      { name: 'Tasks', description: 'Task CRUD and lifecycle operations' },
      { name: 'Subtasks', description: 'Subtask creation, retrieval, and movement' },
      { name: 'Agents', description: 'Agent queue and task signup operations' },
      { name: 'Queues', description: 'Queue management and task assignment' },
      { name: 'Comments', description: 'Task comment operations' },
      { name: 'Links', description: 'Task link/artifact operations' },
    ],
    paths: buildPaths(),
    components: {
      schemas: buildComponentSchemas(),
    },
  };
}
