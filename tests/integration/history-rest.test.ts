/**
 * Task history REST surface + completed_at tests (#892)
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
  const testDbPath = path.join(process.cwd(), 'data', `hist-rest-${Date.now()}-${Math.random()}.db`);
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

  return { app, taskService, commentService, linkService, queueService, db, cleanup };
}

// ISO 8601 regex: YYYY-MM-DDTHH:MM:SSZ or with milliseconds
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

describe('Task history REST + completed_at (#892)', () => {
  let ctx: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    ctx = createTestApp();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  test('GET /tasks/:id/history returns chronological audit trail', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/tasks')
      .send({ title: 'History REST task', created_by: 'agent-a', assigned_to: 'agent-a' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const patched = await request(ctx.app)
      .patch(`/api/v1/tasks/${id}`)
      .send({ status: 'working', updated_by: 'agent-b' });
    expect(patched.status).toBe(200);

    const res = await request(ctx.app).get(`/api/v1/tasks/${id}/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const first = res.body[0];
    expect(first.field_name).toBe('created');
    expect(first.changed_by).toBe('agent-a');
    expect(ISO_8601_REGEX.test(first.changed_at)).toBe(true);

    const statusEntry = res.body.find((h: { field_name: string }) => h.field_name === 'status');
    expect(statusEntry.old_value).toBe('idle');
    expect(statusEntry.new_value).toBe('working');
    expect(statusEntry.changed_by).toBe('agent-b');
  });

  test('GET /tasks/:id/history returns 404 for unknown task', async () => {
    const res = await request(ctx.app).get('/api/v1/tasks/999999/history');
    expect(res.status).toBe(404);
  });

  test('GET /tasks/:id/history returns 400 for non-numeric id', async () => {
    const res = await request(ctx.app).get('/api/v1/tasks/abc/history');
    expect(res.status).toBe(400);
  });

  test('PATCH /tasks/:id with non-string updated_by returns 400', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/tasks')
      .send({ title: 'Bad actor task', created_by: 'agent-a' });
    const id = created.body.id;

    const res = await request(ctx.app)
      .patch(`/api/v1/tasks/${id}`)
      .send({ status: 'working', updated_by: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('updated_by must be a string');
  });

  test('completed_at is set on completion and cleared on reopen', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/tasks')
      .send({ title: 'Completion REST task', created_by: 'agent-a' });
    const id = created.body.id;
    expect(created.body.completed_at).toBeNull();

    const completed = await request(ctx.app)
      .patch(`/api/v1/tasks/${id}`)
      .send({ status: 'complete' });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('complete');
    expect(completed.body.completed_at).not.toBeNull();
    expect(ISO_8601_REGEX.test(completed.body.completed_at)).toBe(true);

    const reopened = await request(ctx.app)
      .patch(`/api/v1/tasks/${id}`)
      .send({ status: 'idle' });
    expect(reopened.body.completed_at).toBeNull();
  });
});
