/**
 * List Response Slimming Tests (token burn fix — task #890)
 *
 * - list_tasks / GET /api/v1/tasks omit `description` by default and cap at 100 rows
 * - include_description=true restores full rows
 * - TINYTASK_LIST_INCLUDE_DESCRIPTION=true env escape hatch restores descriptions globally
 * - get_my_queue / GET /api/v1/agents/:name/queue omit `description` by default
 * - payload budget: default list payload must stay well under the full payload
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseClient } from '../../src/db/client.js';
import { TaskService } from '../../src/services/task-service.js';
import { CommentService } from '../../src/services/comment-service.js';
import { LinkService } from '../../src/services/link-service.js';
import { QueueService } from '../../src/services/queue-service.js';
import { createRestRouter } from '../../src/server/rest.js';
import fs from 'fs';
import path from 'path';

function createTestApp() {
  const testDbPath = path.join(process.cwd(), 'data', `slim-test-${Date.now()}-${Math.random()}.db`);
  const dataDir = path.dirname(testDbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new DatabaseClient(testDbPath);
  db.initialize();

  const taskService = new TaskService(db);
  const commentService = new CommentService(db);
  const linkService = new LinkService(db);
  const queueService = new QueueService(db);

  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRestRouter(taskService, commentService, linkService, queueService));

  const cleanup = () => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  };

  return { app, taskService, cleanup };
}

const LONG_DESCRIPTION =
  'This is a long description used to measure payload size. '.repeat(10); // ~570 chars

describe('List Response Slimming', () => {
  let ctx: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createTestApp();
  });

  afterEach(() => {
    ctx.cleanup();
    delete process.env.TINYTASK_LIST_INCLUDE_DESCRIPTION;
  });

  describe('service level (TaskService.list)', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        ctx.taskService.create({
          title: `Task ${i}`,
          description: LONG_DESCRIPTION,
          created_by: 'tester',
        });
      }
    });

    test('should omit description by default', () => {
      const tasks = ctx.taskService.list();
      expect(tasks).toHaveLength(5);
      for (const task of tasks) {
        expect(task).not.toHaveProperty('description');
        expect(task.title).toBeDefined();
      }
    });

    test('should include description when include_description=true', () => {
      const tasks = ctx.taskService.list({ include_description: true });
      expect(tasks).toHaveLength(5);
      for (const task of tasks) {
        expect(task.description).toBe(LONG_DESCRIPTION);
      }
    });

    test('should include description via TINYTASK_LIST_INCLUDE_DESCRIPTION env escape hatch', () => {
      process.env.TINYTASK_LIST_INCLUDE_DESCRIPTION = 'true';
      const tasks = ctx.taskService.list();
      for (const task of tasks) {
        expect(task.description).toBe(LONG_DESCRIPTION);
      }
    });

    test('should keep get() with full description regardless of list defaults', () => {
      const listed = ctx.taskService.list();
      const fetched = ctx.taskService.get(listed[0].id);
      expect(fetched?.description).toBe(LONG_DESCRIPTION);
    });

    test('should produce a much smaller default payload (budget regression guard)', () => {
      const slim = JSON.stringify(ctx.taskService.list());
      const full = JSON.stringify(ctx.taskService.list({ include_description: true }));
      // Descriptions dominate list payloads (~62% historically). If the default
      // projection ever regresses to include them, this ratio approaches 1.0.
      expect(slim.length).toBeLessThan(full.length * 0.5);
    });
  });

  describe('default limit', () => {
    test('should cap results at 100 by default', () => {
      for (let i = 1; i <= 120; i++) {
        ctx.taskService.create({
          title: `Bulk Task ${i}`,
          description: 'x',
          created_by: 'tester',
        });
      }
      expect(ctx.taskService.list()).toHaveLength(100);
      expect(ctx.taskService.list({ limit: 20 })).toHaveLength(20);
      expect(ctx.taskService.list({ limit: 150 })).toHaveLength(120);
    });

    test('should paginate with offset under the default limit', () => {
      for (let i = 1; i <= 30; i++) {
        ctx.taskService.create({
          title: `Page Task ${i}`,
          description: 'x',
          created_by: 'tester',
        });
      }
      const page1 = ctx.taskService.list({ limit: 10, offset: 0 });
      const page2 = ctx.taskService.list({ limit: 10, offset: 10 });
      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('service level (TaskService.getQueue)', () => {
    beforeEach(() => {
      for (let i = 1; i <= 3; i++) {
        ctx.taskService.create({
          title: `Queue Task ${i}`,
          description: LONG_DESCRIPTION,
          created_by: 'tester',
          assigned_to: 'alice',
          status: 'idle',
        });
      }
    });

    test('should omit description by default', () => {
      const tasks = ctx.taskService.getQueue('alice');
      expect(tasks).toHaveLength(3);
      for (const task of tasks) {
        expect(task).not.toHaveProperty('description');
      }
    });

    test('should include description when requested', () => {
      const tasks = ctx.taskService.getQueue('alice', true);
      for (const task of tasks) {
        expect(task.description).toBe(LONG_DESCRIPTION);
      }
    });
  });

  describe('REST endpoints', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        ctx.taskService.create({
          title: `Rest Task ${i}`,
          description: LONG_DESCRIPTION,
          created_by: 'tester',
          assigned_to: 'alice',
          status: 'idle',
        });
      }
    });

    test('GET /api/v1/tasks should omit description by default', async () => {
      const res = await request(ctx.app).get('/api/v1/tasks').expect(200);
      expect(res.body).toHaveLength(5);
      for (const task of res.body) {
        expect(task).not.toHaveProperty('description');
      }
    });

    test('GET /api/v1/tasks?include_description=true should include description', async () => {
      const res = await request(ctx.app).get('/api/v1/tasks?include_description=true').expect(200);
      for (const task of res.body) {
        expect(task.description).toBe(LONG_DESCRIPTION);
      }
    });

    test('GET /api/v1/agents/alice/queue should omit description by default', async () => {
      const res = await request(ctx.app).get('/api/v1/agents/alice/queue').expect(200);
      expect(res.body).toHaveLength(5);
      for (const task of res.body) {
        expect(task).not.toHaveProperty('description');
      }
    });

    test('GET /api/v1/agents/alice/queue?include_description=true should include description', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/agents/alice/queue?include_description=true')
        .expect(200);
      for (const task of res.body) {
        expect(task.description).toBe(LONG_DESCRIPTION);
      }
    });

    test('GET /api/v1/tasks should reject invalid include_description values', async () => {
      await request(ctx.app).get('/api/v1/tasks?include_description=banana').expect(400);
    });
  });
});
