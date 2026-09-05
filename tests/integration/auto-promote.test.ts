/**
 * Parent Auto-Promotion Opt-Out Tests (task #891 — D-R2d from trio round-2)
 *
 * Default behavior unchanged: a parent's status mirrors its children
 * (all complete → complete, any working → working, else idle).
 * Parents may now opt out with auto_promote=false (per task, at create or via update).
 * Promotions are routed through update() so they refresh updated_at and emit
 * TaskUpdated / TaskStatusChanged events — auditable instead of silent raw SQL.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/events/event-bus.js';
import { TaskEventType } from '../../src/events/event-types.js';
import type { HubMessage, TaskStatusChangedPayload } from '../../src/events/event-types.js';
import { TaskService } from '../../src/services/task-service.js';
import { DatabaseClient } from '../../src/db/client.js';
import fs from 'fs';
import path from 'path';

function createTestSetup() {
  const testDbPath = path.join(
    process.cwd(),
    'data',
    `test-autopromote-${Date.now()}-${Math.random()}.db`
  );
  const dataDir = path.dirname(testDbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new DatabaseClient(testDbPath);
  db.initialize();

  const eventBus = new EventBus();
  const taskService = new TaskService(db, eventBus);

  const events: HubMessage[] = [];
  const unsub = eventBus.on('*', (event) => events.push(event));

  const cleanup = () => {
    unsub();
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  };

  return { taskService, events, cleanup };
}

const PARENT = {
  title: 'Parent task',
  description: 'parent',
  created_by: 'tester',
};

const CHILD = {
  title: 'Child task',
  description: 'child',
  created_by: 'tester',
};

describe('Parent Auto-Promotion Opt-Out', () => {
  let setup: ReturnType<typeof createTestSetup>;

  beforeEach(() => {
    setup = createTestSetup();
  });

  afterEach(() => {
    setup.cleanup();
  });

  test('parents auto-promote by default (baseline behavior preserved)', () => {
    const { taskService } = setup;
    const parent = taskService.create(PARENT);
    expect(parent.auto_promote).toBe(true);

    taskService.create({ ...CHILD, parent_task_id: parent.id });
    const children = taskService.list({ parent_task_id: parent.id });
    taskService.update(children[0].id, { status: 'complete' });

    expect(taskService.get(parent.id)?.status).toBe('complete');
  });

  test('opt-out at create time prevents auto-promotion', () => {
    const { taskService } = setup;
    const parent = taskService.create({ ...PARENT, auto_promote: false });
    expect(parent.auto_promote).toBe(false);

    taskService.create({ ...CHILD, parent_task_id: parent.id });
    const children = taskService.list({ parent_task_id: parent.id });
    taskService.update(children[0].id, { status: 'complete' });

    expect(taskService.get(parent.id)?.status).toBe('idle');
    expect(taskService.get(children[0].id)?.status).toBe('complete');
  });

  test('opt-out via update() prevents auto-promotion', () => {
    const { taskService } = setup;
    const parent = taskService.create(PARENT);
    taskService.create({ ...CHILD, parent_task_id: parent.id });

    const updated = taskService.update(parent.id, { auto_promote: false });
    expect(updated.auto_promote).toBe(false);

    const children = taskService.list({ parent_task_id: parent.id });
    taskService.update(children[0].id, { status: 'complete' });

    expect(taskService.get(parent.id)?.status).toBe('idle');
  });

  test('re-enabling auto_promote resumes promotion', () => {
    const { taskService } = setup;
    const parent = taskService.create({ ...PARENT, auto_promote: false });
    taskService.create({ ...CHILD, parent_task_id: parent.id });

    const children = taskService.list({ parent_task_id: parent.id });
    taskService.update(children[0].id, { status: 'working' });
    expect(taskService.get(parent.id)?.status).toBe('idle');

    taskService.update(parent.id, { auto_promote: true });
    taskService.update(children[0].id, { status: 'complete' });

    expect(taskService.get(parent.id)?.status).toBe('complete');
  });

  test('auto_promote gates only the flagged task, not other ancestors', () => {
    const { taskService } = setup;
    // A (opted out) → B (default) → C
    const a = taskService.create({ ...PARENT, title: 'A', auto_promote: false });
    const b = taskService.create({ ...CHILD, title: 'B', parent_task_id: a.id });
    const c = taskService.create({ ...CHILD, title: 'C', parent_task_id: b.id });

    taskService.update(c.id, { status: 'complete' });

    // B auto-promotes from its child C, but A (opted out) stays idle.
    expect(taskService.get(b.id)?.status).toBe('complete');
    expect(taskService.get(a.id)?.status).toBe('idle');
  });

  test('promotion flows through update(): emits TaskStatusChanged for the parent', () => {
    const { taskService, events } = setup;
    const parent = taskService.create(PARENT);
    taskService.create({ ...CHILD, parent_task_id: parent.id });
    const children = taskService.list({ parent_task_id: parent.id });

    taskService.update(children[0].id, { status: 'complete' });

    const parentPayloads = events
      .filter((e) => e.type === TaskEventType.TaskStatusChanged)
      .map((e) => e.payload as unknown as TaskStatusChangedPayload);

    const parentPromotion = parentPayloads.find(
      (p) => p.taskId === parent.id && p.after === 'complete'
    );
    expect(parentPromotion).toBeDefined();
    expect(parentPromotion?.before).toBe('idle');
  });

  test('opted-out parent emits no status-changed event when children change', () => {
    const { taskService, events } = setup;
    const parent = taskService.create({ ...PARENT, auto_promote: false });
    taskService.create({ ...CHILD, parent_task_id: parent.id });
    const children = taskService.list({ parent_task_id: parent.id });

    taskService.update(children[0].id, { status: 'complete' });

    const parentStatusEvents = events
      .filter((e) => e.type === TaskEventType.TaskStatusChanged)
      .map((e) => e.payload as unknown as TaskStatusChangedPayload)
      .filter((p) => p.taskId === parent.id);

    expect(parentStatusEvents).toHaveLength(0);
  });

  test('archived child does not affect an opted-out parent', () => {
    const { taskService } = setup;
    const parent = taskService.create({ ...PARENT, auto_promote: false });
    const child = taskService.create({ ...CHILD, parent_task_id: parent.id });

    taskService.archive(child.id);

    expect(taskService.get(parent.id)?.status).toBe('idle');
  });
});
