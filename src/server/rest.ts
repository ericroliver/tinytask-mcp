/**
 * REST API adapter for TinyTask
 *
 * Thin Express router that maps all MCP tools/resources to RESTful endpoints.
 * Delegates directly to existing services — no business logic here.
 * Primarily designed for Shogun test coverage: each MCP tool → one REST endpoint.
 *
 * Base path: /api/v1
 */

import { Router, Request, Response } from 'express';
import { TaskService } from '../services/task-service.js';
import { CommentService } from '../services/comment-service.js';
import { LinkService } from '../services/link-service.js';
import { QueueService } from '../services/queue-service.js';
import { logger } from '../utils/index.js';

// ─── Validation Helpers ───────────────────────────────────

const VALID_STATUSES = ['idle', 'working', 'complete'] as const;

/**
 * Validate that a value is an integer (rejecting booleans, null, NaN, Infinity, floats).
 * Returns true only for finite integer numbers.
 */
function isValidInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Validate that a value is a string (rejecting numbers, booleans, objects, arrays, null).
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Validate that a value is an array of strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}

/**
 * Parse and validate a query param as a positive integer.
 * Returns { value, error } - if error is set, value is undefined.
 */
function parseQueryInt(param: string | undefined, fieldName: string): { value: number | undefined; error?: string } {
  if (param === undefined) return { value: undefined };
  const parsed = Number(param);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { value: undefined, error: `${fieldName} must be a non-negative integer` };
  }
  return { value: parsed };
}

/**
 * Parse and validate a query param as a boolean ('true' or 'false').
 * Returns { value, error } - if error is set, value is undefined.
 */
function parseQueryBool(param: string | undefined, fieldName: string): { value: boolean | undefined; error?: string } {
  if (param === undefined) return { value: undefined };
  if (param === 'true') return { value: true };
  if (param === 'false') return { value: false };
  return { value: undefined, error: `${fieldName} must be 'true' or 'false'` };
}

/**
 * Parse and validate a query param as a status string or comma-separated list.
 * Returns an array if multiple values are provided, a single string if one.
 */
function parseQueryStatus(param: string | undefined): { value: 'idle' | 'working' | 'complete' | ('idle' | 'working' | 'complete')[] | undefined; error?: string } {
  if (param === undefined) return { value: undefined };
  const parts = param.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!VALID_STATUSES.includes(part as typeof VALID_STATUSES[number])) {
      return { value: undefined, error: `status must be one of: ${VALID_STATUSES.join(', ')} (got: "${part}")` };
    }
  }
  if (parts.length === 1) return { value: parts[0] as 'idle' | 'working' | 'complete' };
  return { value: parts as ('idle' | 'working' | 'complete')[] };
}

/**
 * Parse and validate a query param as a comma-separated exclude_status list.
 */
function parseQueryExcludeStatus(param: string | undefined): { value: ('idle' | 'working' | 'complete')[] | undefined; error?: string } {
  if (param === undefined) return { value: undefined };
  const parts = param.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!VALID_STATUSES.includes(part as typeof VALID_STATUSES[number])) {
      return { value: undefined, error: `exclude_status must be one of: ${VALID_STATUSES.join(', ')} (got: "${part}")` };
    }
  }
  return { value: parts as ('idle' | 'working' | 'complete')[] };
}

/**
 * Validate the body of POST /tasks and PATCH /tasks/:id for type-correctness.
 * Returns an error string if validation fails, or undefined if valid.
 */
function validateTaskBodyFields(body: Record<string, unknown>, isPatch: boolean): string | undefined {
  // title: must be a string if present
  if (body.title !== undefined) {
    if (!isString(body.title)) return 'title must be a string';
    if (body.title.trim().length === 0) return 'Task title is required';
  } else if (!isPatch) {
    return 'Task title is required';
  }

  // priority: must be a finite integer if provided (reject null, bool, string, float, NaN, Infinity)
  if (body.priority !== undefined) {
    if (body.priority === null || !isValidInteger(body.priority)) {
      return 'priority must be a finite integer';
    }
  }

  // tags: must be an array of strings if provided
  if (body.tags !== undefined && body.tags !== null) {
    if (!isStringArray(body.tags)) {
      return 'tags must be an array of strings';
    }
  }

  // status: must be valid if provided
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
      return `Invalid status: ${body.status}. Must be one of: ${VALID_STATUSES.join(', ')}`;
    }
  }

  // auto_promote: must be a boolean if provided
  if (body.auto_promote !== undefined && typeof body.auto_promote !== 'boolean') {
    return 'auto_promote must be a boolean';
  }

  // updated_by: must be a string if provided (actor recorded in task history)
  if (body.updated_by !== undefined && body.updated_by !== null && !isString(body.updated_by)) {
    return 'updated_by must be a string';
  }

  // description: must be a string if provided
  if (body.description !== undefined && body.description !== null && !isString(body.description)) {
    return 'description must be a string';
  }

  // assigned_to: must be a string if provided
  if (body.assigned_to !== undefined && body.assigned_to !== null && !isString(body.assigned_to)) {
    return 'assigned_to must be a string';
  }

  // created_by: required for task creation (not for updates)
  if (!isPatch && (!body.created_by || (typeof body.created_by === 'string' && body.created_by.trim().length === 0))) {
    return 'created_by is required';
  }

  // created_by: must be a string if provided
  if (body.created_by !== undefined && body.created_by !== null && !isString(body.created_by)) {
    return 'created_by must be a string';
  }

  return undefined;
}

/**
 * Create the REST API router with all endpoints.
 */
export function createRestRouter(
  taskService: TaskService,
  commentService: CommentService,
  linkService: LinkService,
  queueService: QueueService
): Router {
  const router = Router();

  // ─── Middleware ──────────────────────────────────────────

  router.use((req, _res, next) => {
    logger.info(`REST ${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });

  // ─── Tasks ───────────────────────────────────────────────

  // POST /api/v1/tasks — create_task
  router.post('/tasks', (req: Request, res: Response) => {
    try {
      // Validate body field types
      const validationError = validateTaskBodyFields(req.body, false);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      const task = taskService.create({
        title: req.body.title,
        description: req.body.description,
        assigned_to: req.body.assigned_to,
        created_by: req.body.created_by,
        priority: req.body.priority,
        tags: req.body.tags,
        parent_task_id: req.body.parent_task_id,
        queue_name: req.body.queue_name,
        blocked_by_task_id: req.body.blocked_by_task_id,
        auto_promote: req.body.auto_promote,
      });
      res.status(201).json(task);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /api/v1/tasks — list_tasks
  router.get('/tasks', (req: Request, res: Response) => {
    try {
      // Validate query parameters
      const statusResult = parseQueryStatus(req.query.status as string | undefined);
      if (statusResult.error) {
        res.status(400).json({ error: statusResult.error });
        return;
      }

      const excludeStatusResult = parseQueryExcludeStatus(req.query.exclude_status as string | undefined);
      if (excludeStatusResult.error) {
        res.status(400).json({ error: excludeStatusResult.error });
        return;
      }

      const limitResult = parseQueryInt(req.query.limit as string | undefined, 'limit');
      if (limitResult.error) {
        res.status(400).json({ error: limitResult.error });
        return;
      }

      const offsetResult = parseQueryInt(req.query.offset as string | undefined, 'offset');
      if (offsetResult.error) {
        res.status(400).json({ error: offsetResult.error });
        return;
      }

      const includeArchivedResult = parseQueryBool(req.query.include_archived as string | undefined, 'include_archived');
      if (includeArchivedResult.error) {
        res.status(400).json({ error: includeArchivedResult.error });
        return;
      }

      const excludeSubtasksResult = parseQueryBool(req.query.exclude_subtasks as string | undefined, 'exclude_subtasks');
      if (excludeSubtasksResult.error) {
        res.status(400).json({ error: excludeSubtasksResult.error });
        return;
      }

      let parentTaskId: number | undefined | null = undefined;
      if (req.query.parent_task_id !== undefined) {
        if (req.query.parent_task_id === 'null') {
          parentTaskId = null;
        } else {
          const parsed = parseInt(req.query.parent_task_id as string, 10);
          if (isNaN(parsed)) {
            res.status(400).json({ error: 'parent_task_id must be an integer or null' });
            return;
          }
          parentTaskId = parsed;
        }
      }

      const includeDescriptionResult = parseQueryBool(req.query.include_description as string | undefined, 'include_description');
      if (includeDescriptionResult.error) {
        res.status(400).json({ error: includeDescriptionResult.error });
        return;
      }

      const tasks = taskService.list({
        assigned_to: req.query.assigned_to as string | undefined,
        status: statusResult.value,
        exclude_status: excludeStatusResult.value,
        include_archived: includeArchivedResult.value ?? false,
        include_description: includeDescriptionResult.value,
        limit: limitResult.value,
        offset: offsetResult.value,
        queue_name: req.query.queue_name as string | undefined,
        parent_task_id: parentTaskId,
        exclude_subtasks: excludeSubtasksResult.value ?? false,
      });
      res.json(tasks);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /api/v1/tasks/:id — get_task
  router.get('/tasks/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }
      const task = taskService.get(id, true);
      if (!task) {
        res.status(404).json({ error: `Task ${id} not found` });
        return;
      }
      res.json(task);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /api/v1/tasks/:id/history — audit trail for a task (chronological, oldest first)
  router.get('/tasks/:id/history', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }
      const history = taskService.getHistory(id);
      res.json(history);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // PATCH /api/v1/tasks/:id — update_task
  router.patch('/tasks/:id', (req: Request, res: Response) => {    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }

      // Validate body field types (partial validation for PATCH)
      const validationError = validateTaskBodyFields(req.body, true);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      const task = taskService.update(id, {
        title: req.body.title,
        description: req.body.description,
        status: req.body.status,
        assigned_to: req.body.assigned_to,
        priority: req.body.priority,
        tags: req.body.tags,
        parent_task_id: req.body.parent_task_id,
        queue_name: req.body.queue_name,
        blocked_by_task_id: req.body.blocked_by_task_id,
        auto_promote: req.body.auto_promote,
        updated_by: req.body.updated_by,
      });
      res.json(task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // DELETE /api/v1/tasks/:id — delete_task
  router.delete('/tasks/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }
      taskService.delete(id);
      res.json({ success: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // POST /api/v1/tasks/:id/archive — archive_task
  router.post('/tasks/:id/archive', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }
      const task = taskService.archive(id);
      res.json(task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // ─── Subtasks ───────────────────────────────────────────

  // POST /api/v1/tasks/:parentId/subtasks — create_subtask
  router.post('/tasks/:parentId/subtasks', (req: Request, res: Response) => {
    try {
      const parentTaskId = parseInt(req.params.parentId, 10);
      if (isNaN(parentTaskId)) {
        res.status(400).json({ error: `Invalid parent task ID: ${req.params.parentId}` });
        return;
      }

      // Validate body field types (same validation as POST /tasks)
      const validationError = validateTaskBodyFields(req.body, false);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      const task = taskService.createSubtask(parentTaskId, {
        title: req.body.title,
        description: req.body.description,
        assigned_to: req.body.assigned_to,
        created_by: req.body.created_by,
        priority: req.body.priority,
        tags: req.body.tags,
        queue_name: req.body.queue_name,
      });
      res.status(201).json(task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found') || msg.includes('Parent')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // GET /api/v1/tasks/:parentId/subtasks — get_subtasks
  router.get('/tasks/:parentId/subtasks', (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId, 10);
      const recursive = req.query.recursive === 'true';
      const include_archived = req.query.include_archived === 'true';
      const subtasks = taskService.getSubtasks(parentId, recursive, include_archived);
      res.json(subtasks);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /api/v1/tasks/:id/hierarchy — get_task_with_subtasks
  router.get('/tasks/:id/hierarchy', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      const recursive = req.query.recursive !== 'false'; // default true
      const result = taskService.getTaskWithSubtasks(taskId, recursive);
      if (!result) {
        res.status(404).json({ error: `Task ${taskId} not found` });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // PATCH /api/v1/tasks/:id/parent — move_subtask
  router.patch('/tasks/:id/parent', (req: Request, res: Response) => {
    try {
      const subtaskId = parseInt(req.params.id, 10);
      if (isNaN(subtaskId)) {
        res.status(400).json({ error: 'Invalid task ID' });
        return;
      }

      // If new_parent_id is omitted, return 400 — it's a required field
      if (req.body.new_parent_id === undefined) {
        res.status(400).json({ error: 'new_parent_id is required (use null to make top-level)' });
        return;
      }

      const newParentId = req.body.new_parent_id === null
        ? null
        : parseInt(req.body.new_parent_id, 10);
      if (newParentId !== null && isNaN(newParentId)) {
        res.status(400).json({ error: 'Invalid new_parent_id' });
        return;
      }

      const result = taskService.moveSubtask(subtaskId, newParentId);
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // ─── Agent workflow ───────────────────────────────────────

  // GET /api/v1/agents/:name/queue — get_my_queue
  router.get('/agents/:name/queue', (req: Request, res: Response) => {
    try {
      const includeDescriptionResult = parseQueryBool(req.query.include_description as string | undefined, 'include_description');
      if (includeDescriptionResult.error) {
        res.status(400).json({ error: includeDescriptionResult.error });
        return;
      }
      const tasks = taskService.getQueue(req.params.name, includeDescriptionResult.value);
      res.json(tasks);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // POST /api/v1/agents/:name/signup — signup_for_task
  router.post('/agents/:name/signup', (req: Request, res: Response) => {
    try {
      const task = taskService.signupForTask(req.params.name);
      if (!task) {
        res.status(404).json({ error: 'No idle tasks available for signup' });
        return;
      }
      res.json(task);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // POST /api/v1/tasks/:id/transfer — move_task (transfer between agents)
  router.post('/tasks/:id/transfer', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      if (isNaN(taskId)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }

      // Validate required fields
      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({ error: 'Request body is required' });
        return;
      }
      if (!isString(req.body.current_agent) || req.body.current_agent.trim().length === 0) {
        res.status(400).json({ error: 'current_agent is required and must be a non-empty string' });
        return;
      }
      if (!isString(req.body.new_agent) || req.body.new_agent.trim().length === 0) {
        res.status(400).json({ error: 'new_agent is required and must be a non-empty string' });
        return;
      }
      if (!isString(req.body.comment) || req.body.comment.trim().length === 0) {
        res.status(400).json({ error: 'comment is required and must be a non-empty string' });
        return;
      }

      const result = taskService.moveTask(
        taskId,
        req.body.current_agent,
        req.body.new_agent,
        req.body.comment
      );
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // ─── Queues ──────────────────────────────────────────────

  // GET /api/v1/queues — list_queues
  router.get('/queues', (_req: Request, res: Response) => {
    try {
      const queues = queueService.listQueues();
      res.json(queues);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // GET /api/v1/queues/:name/stats — get_queue_stats
  router.get('/queues/:name/stats', (req: Request, res: Response) => {
    try {
      const stats = queueService.getQueueStats(req.params.name);
      res.json(stats);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // POST /api/v1/queues/:name/tasks — add_task_to_queue
  router.post('/queues/:name/tasks', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.body?.task_id, 10);
      if (isNaN(taskId)) {
        res.status(400).json({ error: 'task_id is required and must be a number' });
        return;
      }

      const task = queueService.addTaskToQueue(taskId, req.params.name);
      res.json(task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // GET /api/v1/queues/:name/tasks — get_queue_tasks
  router.get('/queues/:name/tasks', (req: Request, res: Response) => {
    try {
      // Validate query parameters
      const statusResult = parseQueryStatus(req.query.status as string | undefined);
      if (statusResult.error) {
        res.status(400).json({ error: statusResult.error });
        return;
      }

      const excludeStatusResult = parseQueryExcludeStatus(req.query.exclude_status as string | undefined);
      if (excludeStatusResult.error) {
        res.status(400).json({ error: excludeStatusResult.error });
        return;
      }

      const limitResult = parseQueryInt(req.query.limit as string | undefined, 'limit');
      if (limitResult.error) {
        res.status(400).json({ error: limitResult.error });
        return;
      }

      const offsetResult = parseQueryInt(req.query.offset as string | undefined, 'offset');
      if (offsetResult.error) {
        res.status(400).json({ error: offsetResult.error });
        return;
      }

      const includeArchivedResult = parseQueryBool(req.query.include_archived as string | undefined, 'include_archived');
      if (includeArchivedResult.error) {
        res.status(400).json({ error: includeArchivedResult.error });
        return;
      }

      const excludeSubtasksResult = parseQueryBool(req.query.exclude_subtasks as string | undefined, 'exclude_subtasks');
      if (excludeSubtasksResult.error) {
        res.status(400).json({ error: excludeSubtasksResult.error });
        return;
      }

      let parentTaskId: number | undefined | null = undefined;
      if (req.query.parent_task_id !== undefined) {
        if (req.query.parent_task_id === 'null') {
          parentTaskId = null;
        } else {
          const parsed = parseInt(req.query.parent_task_id as string, 10);
          if (isNaN(parsed)) {
            res.status(400).json({ error: 'parent_task_id must be an integer or null' });
            return;
          }
          parentTaskId = parsed;
        }
      }

      const tasks = queueService.getQueueTasks(req.params.name, {
        assigned_to: req.query.assigned_to as string | undefined,
        status: statusResult.value,
        exclude_status: excludeStatusResult.value,
        parent_task_id: parentTaskId,
        exclude_subtasks: excludeSubtasksResult.value ?? false,
        include_archived: includeArchivedResult.value ?? false,
        limit: limitResult.value,
        offset: offsetResult.value,
      });
      res.json(tasks);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // DELETE /api/v1/queues/:name/tasks — clear_queue
  router.delete('/queues/:name/tasks', (req: Request, res: Response) => {
    try {
      const count = queueService.clearQueue(req.params.name);
      res.json({ success: true, queue_name: req.params.name, tasks_removed: count });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // DELETE /api/v1/tasks/:id/queue — remove_task_from_queue
  router.delete('/tasks/:id/queue', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      if (isNaN(taskId)) {
        res.status(400).json({ error: 'Invalid task ID' });
        return;
      }

      const task = queueService.removeTaskFromQueue(taskId);
      res.json(task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // PATCH /api/v1/tasks/:id/queue — move_task_to_queue
  router.patch('/tasks/:id/queue', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      if (isNaN(taskId)) {
        res.status(400).json({ error: 'Invalid task ID' });
        return;
      }

      const newQueueName = req.body?.new_queue_name;
      if (typeof newQueueName !== 'string' || newQueueName.trim().length === 0) {
        res.status(400).json({ error: 'new_queue_name is required and must be a non-empty string' });
        return;
      }

      const task = queueService.moveTaskToQueue(taskId, newQueueName);
      res.json(task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // ─── Comments ────────────────────────────────────────────

  // POST /api/v1/tasks/:id/comments — add_comment
  router.post('/tasks/:id/comments', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      if (isNaN(taskId)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }

      // Validate content is a string
      if (!isString(req.body.content)) {
        res.status(400).json({ error: 'content is required and must be a string' });
        return;
      }

      const comment = commentService.create({
        task_id: taskId,
        content: req.body.content,
        created_by: req.body.created_by,
      });
      res.status(201).json(comment);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // GET /api/v1/tasks/:id/comments — list_comments
  router.get('/tasks/:id/comments', (req: Request, res: Response) => {
    try {
      const comments = commentService.listByTask(parseInt(req.params.id, 10));
      res.json(comments);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // PATCH /api/v1/comments/:id — update_comment
  router.patch('/comments/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid comment ID: ${req.params.id}` });
        return;
      }

      // Validate content is a string
      if (!isString(req.body.content)) {
        res.status(400).json({ error: 'content is required and must be a string' });
        return;
      }

      const comment = commentService.update(id, req.body.content);
      res.json(comment);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // DELETE /api/v1/comments/:id — delete_comment
  router.delete('/comments/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid comment ID: ${req.params.id}` });
        return;
      }
      commentService.delete(id);
      res.json({ success: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // GET /api/v1/comments/:id — get_comment
  router.get('/comments/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid comment ID: ${req.params.id}` });
        return;
      }

      const comment = commentService.get(id);
      if (!comment) {
        res.status(404).json({ error: `Comment not found: ${id}` });
        return;
      }
      res.json(comment);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // POST /api/v1/comments/:id/move — move_comment
  router.post('/comments/:id/move', (req: Request, res: Response) => {
    try {
      const commentId = parseInt(req.params.id, 10);
      if (isNaN(commentId)) {
        res.status(400).json({ error: `Invalid comment ID: ${req.params.id}` });
        return;
      }

      if (!req.body || typeof req.body.to_task_id !== 'number') {
        res.status(400).json({ error: 'to_task_id is required and must be a number' });
        return;
      }

      const newComment = commentService.move(commentId, req.body.to_task_id);
      res.status(201).json(newComment);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // ─── Links ───────────────────────────────────────────────

  // POST /api/v1/tasks/:id/links — add_link
  router.post('/tasks/:id/links', (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      if (isNaN(taskId)) {
        res.status(400).json({ error: `Invalid task ID: ${req.params.id}` });
        return;
      }

      // Validate url is a string
      if (!isString(req.body.url)) {
        res.status(400).json({ error: 'url is required and must be a string' });
        return;
      }
      // Validate description if provided
      if (req.body.description !== undefined && req.body.description !== null && !isString(req.body.description)) {
        res.status(400).json({ error: 'description must be a string' });
        return;
      }

      const link = linkService.create({
        task_id: taskId,
        url: req.body.url,
        description: req.body.description,
        created_by: req.body.created_by,
      });
      res.status(201).json(link);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // GET /api/v1/tasks/:id/links — list_links
  router.get('/tasks/:id/links', (req: Request, res: Response) => {
    try {
      const links = linkService.listByTask(parseInt(req.params.id, 10));
      res.json(links);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // PATCH /api/v1/links/:id — update_link
  router.patch('/links/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid link ID: ${req.params.id}` });
        return;
      }

      // Validate url if provided
      if (req.body.url !== undefined && !isString(req.body.url)) {
        res.status(400).json({ error: 'url must be a string' });
        return;
      }
      // Validate description if provided
      if (req.body.description !== undefined && req.body.description !== null && !isString(req.body.description)) {
        res.status(400).json({ error: 'description must be a string' });
        return;
      }

      const link = linkService.update(id, {
        url: req.body.url,
        description: req.body.description,
      });
      res.json(link);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  // DELETE /api/v1/links/:id — delete_link
  router.delete('/links/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: `Invalid link ID: ${req.params.id}` });
        return;
      }
      linkService.delete(id);
      res.json({ success: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(400).json({ error: msg });
      }
    }
  });

  return router;
}
