/**
 * Tool definitions for MCP
 * Defines metadata for all available tools
 */

import { z } from 'zod';

/**
 * Zod schema for tool input parameters
 */
export const toolSchemas = {
  // Task tools
  create_task: z.object({
    title: z.string().describe('Task title'),
    description: z.string().optional().describe('Task description'),
    assigned_to: z.string().optional().describe('Agent name to assign to'),
    created_by: z.string().describe('Agent name creating the task (required)'),
    priority: z.coerce.number().optional().describe('Priority level (default: 0)'),
    tags: z.array(z.string()).optional().describe('Array of tags'),
    parent_task_id: z.coerce.number().optional().describe('Parent task ID (creates subtask)'),
    queue_name: z.string().optional().describe('Queue name (dev, product, qa, etc.)'),
    blocked_by_task_id: z.coerce.number().optional().describe('ID of task that blocks this task. Task will be blocked until the blocking task is completed.'),
    auto_promote: z.boolean().optional().describe("Whether this task's status auto-updates from its children's statuses (default: true). Set false to opt out."),
  }).strict(),

  update_task: z.object({
    id: z.coerce.number().describe('Task ID'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    status: z.enum(['idle', 'working', 'complete']).optional().describe('New status'),
    assigned_to: z.string().optional().describe('New assignee'),
    priority: z.coerce.number().optional().describe('New priority'),
    tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
    parent_task_id: z.coerce.number().optional().describe('New parent task ID (null to make top-level)'),
    queue_name: z.string().optional().describe('New queue name'),
    blocked_by_task_id: z.coerce.number().nullable().optional().describe('ID of task that blocks this task. Set to null to unblock. Task cannot block itself.'),
    auto_promote: z.boolean().optional().describe("Whether this task's status auto-updates from its children's statuses (default: true). Set false to opt out."),
    updated_by: z.string().optional().describe('Agent making this change, recorded in task history'),
  }).strict(),

  get_task: z.object({
    id: z.coerce.number().describe('Task ID'),
  }).strict(),

  get_task_history: z.object({
    task_id: z.coerce.number().describe('Task ID to get history for'),
  }).strict(),

  delete_task: z.object({
    id: z.coerce.number().describe('Task ID'),
  }).strict(),

  archive_task: z.object({
    id: z.coerce.number().describe('Task ID'),
  }).strict(),

  list_tasks: z.object({
    assigned_to: z.string().optional().describe('Filter by assignee'),
    status: z.union([
      z.enum(['idle', 'working', 'complete']),
      z.array(z.enum(['idle', 'working', 'complete'])),
    ]).optional().describe('Filter by status (single value or array of statuses)'),
    exclude_status: z.array(z.enum(['idle', 'working', 'complete'])).optional().describe('Exclude tasks with these statuses'),
    include_archived: z.boolean().optional().describe('Include archived tasks'),
    include_description: z.boolean().optional().describe('Include full task descriptions (default: false - descriptions omitted to keep responses small)'),
    limit: z.coerce.number().optional().describe('Max results (default: 100)'),
    offset: z.coerce.number().optional().describe('Pagination offset'),
    queue_name: z.string().optional().describe('Filter by queue name'),
    parent_task_id: z.coerce.number().optional().describe('Filter by parent task ID'),
    exclude_subtasks: z.boolean().optional().describe('Exclude subtasks from results (default: false)'),
  }).strict(),

  // Subtask tools
  create_subtask: z.object({
    parent_task_id: z.coerce.number().describe('Parent task ID'),
    title: z.string().describe('Subtask title'),
    description: z.string().optional().describe('Subtask description'),
    assigned_to: z.string().optional().describe('Agent to assign to'),
    created_by: z.string().describe('Agent name creating the subtask (required)'),
    priority: z.coerce.number().optional().describe('Priority (default: 0)'),
    tags: z.array(z.string()).optional().describe('Tags'),
    queue_name: z.string().optional().describe('Override queue from parent'),
  }).strict(),

  get_subtasks: z.object({
    parent_task_id: z.coerce.number().describe('Parent task ID'),
    recursive: z.boolean().optional().describe('Include nested subtasks (default: false)'),
    include_archived: z.boolean().optional().describe('Include archived subtasks'),
  }).strict(),

  get_task_with_subtasks: z.object({
    task_id: z.coerce.number().describe('Task ID'),
    recursive: z.boolean().optional().describe('Include nested subtasks (default: false)'),
  }).strict(),

  move_subtask: z.object({
    subtask_id: z.coerce.number().describe('Subtask ID to move'),
    new_parent_id: z.coerce.number().optional().describe('New parent task ID (null or omit to make top-level)'),
  }).strict(),

  get_my_queue: z.object({
    agent_name: z.string().describe('Agent name'),
    include_description: z.boolean().optional().describe('Include full task descriptions (default: false - descriptions omitted to keep responses small)'),
  }).strict(),

  signup_for_task: z.object({
    agent_name: z.string().describe('Agent name signing up for task'),
  }).strict(),

  move_task: z.object({
    task_id: z.coerce.number().describe('Task ID to transfer'),
    current_agent: z.string().describe('Current agent (for verification)'),
    new_agent: z.string().describe('Agent to transfer to'),
    comment: z.string().describe('Handoff message/context'),
  }).strict(),

  // Queue tools
  list_queues: z.object({}).strict(),

  get_queue_stats: z.object({
    queue_name: z.string().describe('Queue name'),
  }).strict(),

  add_task_to_queue: z.object({
    task_id: z.coerce.number().describe('Task ID'),
    queue_name: z.string().describe('Queue name to add task to'),
  }).strict(),

  remove_task_from_queue: z.object({
    task_id: z.coerce.number().describe('Task ID'),
  }).strict(),

  move_task_to_queue: z.object({
    task_id: z.coerce.number().describe('Task ID'),
    new_queue_name: z.string().describe('New queue name to move task to'),
  }).strict(),

  get_queue_tasks: z.object({
    queue_name: z.string().describe('Queue name'),
    assigned_to: z.string().optional().describe('Filter by assignee'),
    status: z.union([
      z.enum(['idle', 'working', 'complete']),
      z.array(z.enum(['idle', 'working', 'complete'])),
    ]).optional().describe('Filter by status (single value or array of statuses)'),
    exclude_status: z.array(z.enum(['idle', 'working', 'complete'])).optional().describe('Exclude tasks with these statuses'),
    parent_task_id: z.coerce.number().optional().describe('Filter by parent task ID'),
    exclude_subtasks: z.boolean().optional().describe('Exclude subtasks from results'),
    include_archived: z.boolean().optional().describe('Include archived tasks'),
    limit: z.coerce.number().optional().describe('Max results'),
    offset: z.coerce.number().optional().describe('Pagination offset'),
  }).strict(),

  clear_queue: z.object({
    queue_name: z.string().describe('Queue name to clear'),
  }).strict(),

  // Comment tools
  add_comment: z.object({
    task_id: z.coerce.number().describe('Task ID'),
    content: z.string().describe('Comment text'),
    created_by: z.string().optional().describe('Agent name'),
  }),

  update_comment: z.object({
    id: z.coerce.number().describe('Comment ID'),
    content: z.string().describe('New comment text'),
  }),

  delete_comment: z.object({
    id: z.coerce.number().describe('Comment ID'),
  }),

  list_comments: z.object({
    task_id: z.coerce.number().describe('Task ID'),
  }),

  get_comment: z.object({
    id: z.coerce.number().describe('Comment ID'),
  }),

  move_comment: z.object({
    comment_id: z.coerce.number().describe('Comment ID to move'),
    to_task_id: z.coerce.number().describe('Target task ID to move the comment to'),
  }),

  // Link tools
  add_link: z.object({
    task_id: z.coerce.number().describe('Task ID'),
    url: z.string().describe('Link/path/reference'),
    description: z.string().optional().describe('Description of the artifact'),
    created_by: z.string().optional().describe('Agent name'),
  }),

  update_link: z.object({
    id: z.coerce.number().describe('Link ID'),
    url: z.string().optional().describe('New URL'),
    description: z.string().optional().describe('New description'),
  }),

  delete_link: z.object({
    id: z.coerce.number().describe('Link ID'),
  }),

  list_links: z.object({
    task_id: z.coerce.number().describe('Task ID'),
  }),
};

/**
 * Convert Zod schema to JSON Schema for MCP tool metadata
 */
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema._def.shape();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    let zodType = value as z.ZodTypeAny;
    const description = zodType.description || '';

    // Unwrap ZodEffects (used by z.coerce) to get the underlying type
    if (zodType instanceof z.ZodEffects) {
      zodType = zodType._def.schema;
    }

    // Handle different Zod types
    if (zodType instanceof z.ZodString) {
      properties[key] = { type: 'string', description };
    } else if (zodType instanceof z.ZodNumber) {
      properties[key] = { type: 'number', description };
    } else if (zodType instanceof z.ZodBoolean) {
      properties[key] = { type: 'boolean', description };
    } else if (zodType instanceof z.ZodArray) {
      properties[key] = { type: 'array', description, items: { type: 'string' } };
    } else if (zodType instanceof z.ZodEnum) {
      properties[key] = {
        type: 'string',
        description,
        enum: zodType._def.values,
      };
    } else if (zodType instanceof z.ZodOptional) {
      // Recursive handling for optional types
      let innerType = zodType._def.innerType;
      
      // Unwrap ZodEffects in optional types as well
      if (innerType instanceof z.ZodEffects) {
        innerType = innerType._def.schema;
      }
      
      // Handle nullable types (e.g., z.number().nullable())
      if (innerType instanceof z.ZodNullable) {
        let innerNullableType = innerType._def.innerType;
        
        // Unwrap ZodEffects in nullable types
        if (innerNullableType instanceof z.ZodEffects) {
          innerNullableType = innerNullableType._def.schema;
        }
        
        if (innerNullableType instanceof z.ZodNumber) {
          properties[key] = { type: ['number', 'null'], description };
        } else if (innerNullableType instanceof z.ZodString) {
          properties[key] = { type: ['string', 'null'], description };
        } else if (innerNullableType instanceof z.ZodBoolean) {
          properties[key] = { type: ['boolean', 'null'], description };
        }
      } else if (innerType instanceof z.ZodString) {
        properties[key] = { type: 'string', description };
      } else if (innerType instanceof z.ZodNumber) {
        properties[key] = { type: 'number', description };
      } else if (innerType instanceof z.ZodBoolean) {
        properties[key] = { type: 'boolean', description };
      } else if (innerType instanceof z.ZodArray) {
        properties[key] = { type: 'array', description, items: { type: 'string' } };
      } else if (innerType instanceof z.ZodEnum) {
        properties[key] = {
          type: 'string',
          description,
          enum: innerType._def.values,
        };
      }
    }

    // Check if required (unwrap ZodEffects first)
    let typeToCheck = value as z.ZodTypeAny;
    if (typeToCheck instanceof z.ZodEffects) {
      typeToCheck = typeToCheck._def.schema;
    }
    if (!(typeToCheck instanceof z.ZodOptional)) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Tool metadata in MCP format
 */
export const toolDefinitions = [
  // Task tools
  {
    name: 'create_task',
    description: 'Create a new task in the system',
    inputSchema: zodToJsonSchema(toolSchemas.create_task),
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    inputSchema: zodToJsonSchema(toolSchemas.update_task),
  },
  {
    name: 'get_task',
    description: 'Get a task by ID with all comments and links',
    inputSchema: zodToJsonSchema(toolSchemas.get_task),
  },
  {
    name: 'get_task_history',
    description: 'Get the audit-trail history for a task (chronological): field changes with old/new values, acting agent, and timestamps',
    inputSchema: zodToJsonSchema(toolSchemas.get_task_history),
  },
  {
    name: 'delete_task',
    description: 'Delete a task by ID',
    inputSchema: zodToJsonSchema(toolSchemas.delete_task),
  },
  {
    name: 'archive_task',
    description: 'Archive a task by ID',
    inputSchema: zodToJsonSchema(toolSchemas.archive_task),
  },
  {
    name: 'list_tasks',
    description: 'List tasks with optional filters',
    inputSchema: zodToJsonSchema(toolSchemas.list_tasks),
  },
  {
    name: 'get_my_queue',
    description: 'Get all open tasks assigned to a specific agent',
    inputSchema: zodToJsonSchema(toolSchemas.get_my_queue),
  },
  {
    name: 'signup_for_task',
    description: 'Claim the highest priority idle task from your queue and mark it as working',
    inputSchema: zodToJsonSchema(toolSchemas.signup_for_task),
  },
  {
    name: 'move_task',
    description: 'Transfer a task to another agent with status reset to idle and add handoff comment',
    inputSchema: zodToJsonSchema(toolSchemas.move_task),
  },

  // Subtask tools
  {
    name: 'create_subtask',
    description: 'Create a new subtask under a parent task',
    inputSchema: zodToJsonSchema(toolSchemas.create_subtask),
  },
  {
    name: 'get_subtasks',
    description: 'Get all subtasks for a parent task',
    inputSchema: zodToJsonSchema(toolSchemas.get_subtasks),
  },
  {
    name: 'get_task_with_subtasks',
    description: 'Get a task with all its subtasks in a tree structure',
    inputSchema: zodToJsonSchema(toolSchemas.get_task_with_subtasks),
  },
  {
    name: 'move_subtask',
    description: 'Move a subtask to a different parent or make it a top-level task',
    inputSchema: zodToJsonSchema(toolSchemas.move_subtask),
  },

  // Queue tools
  {
    name: 'list_queues',
    description: 'List all queue names currently in use',
    inputSchema: zodToJsonSchema(toolSchemas.list_queues),
  },
  {
    name: 'get_queue_stats',
    description: 'Get statistics for a specific queue',
    inputSchema: zodToJsonSchema(toolSchemas.get_queue_stats),
  },
  {
    name: 'add_task_to_queue',
    description: 'Add an existing task to a queue',
    inputSchema: zodToJsonSchema(toolSchemas.add_task_to_queue),
  },
  {
    name: 'remove_task_from_queue',
    description: 'Remove a task from its queue',
    inputSchema: zodToJsonSchema(toolSchemas.remove_task_from_queue),
  },
  {
    name: 'move_task_to_queue',
    description: 'Move a task from one queue to another',
    inputSchema: zodToJsonSchema(toolSchemas.move_task_to_queue),
  },
  {
    name: 'get_queue_tasks',
    description: 'Get all tasks in a queue with optional filters',
    inputSchema: zodToJsonSchema(toolSchemas.get_queue_tasks),
  },
  {
    name: 'clear_queue',
    description: 'Remove all tasks from a queue',
    inputSchema: zodToJsonSchema(toolSchemas.clear_queue),
  },

  // Comment tools
  {
    name: 'add_comment',
    description: 'Add a comment to a task',
    inputSchema: zodToJsonSchema(toolSchemas.add_comment),
  },
  {
    name: 'update_comment',
    description: 'Update an existing comment',
    inputSchema: zodToJsonSchema(toolSchemas.update_comment),
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment by ID',
    inputSchema: zodToJsonSchema(toolSchemas.delete_comment),
  },
  {
    name: 'list_comments',
    description: 'List all comments for a task',
    inputSchema: zodToJsonSchema(toolSchemas.list_comments),
  },
  {
    name: 'get_comment',
    description: 'Get a single comment by ID',
    inputSchema: zodToJsonSchema(toolSchemas.get_comment),
  },
  {
    name: 'move_comment',
    description: 'Move a comment to a different task, leaving a record on the original task',
    inputSchema: zodToJsonSchema(toolSchemas.move_comment),
  },

  // Link tools
  {
    name: 'add_link',
    description: 'Add a link/artifact reference to a task',
    inputSchema: zodToJsonSchema(toolSchemas.add_link),
  },
  {
    name: 'update_link',
    description: 'Update an existing link',
    inputSchema: zodToJsonSchema(toolSchemas.update_link),
  },
  {
    name: 'delete_link',
    description: 'Delete a link by ID',
    inputSchema: zodToJsonSchema(toolSchemas.delete_link),
  },
  {
    name: 'list_links',
    description: 'List all links for a task',
    inputSchema: zodToJsonSchema(toolSchemas.list_links),
  },
];
