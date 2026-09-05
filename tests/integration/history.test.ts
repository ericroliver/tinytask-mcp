/**
 * Task history audit trail integration tests (#892)
 *
 * Verifies that the documented audit trail actually exists:
 * - task_history rows are recorded on create / update / transfer / archive /
 *   queue changes, with old value, new value, and actor where known
 * - completed_at is set on transition to complete and cleared on reopen
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestClient, createTestTask, TestClient } from '../helpers/test-client.js';

describe('Task history audit trail', () => {
  let client: TestClient;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.cleanup();
  });

  describe('history recording', () => {
    it('records a creation entry with the creator as actor', () => {
      const task = client.taskService.createTask(
        createTestTask({ created_by: 'agent-creator', status: 'idle' })
      );

      const history = client.taskService.getHistory(task.id);
      expect(history).toHaveLength(1);
      expect(history[0].field_name).toBe('created');
      expect(history[0].old_value).toBeNull();
      expect(history[0].new_value).toBe('idle');
      expect(history[0].changed_by).toBe('agent-creator');
    });

    it('records field changes with old and new values on update', () => {
      const task = client.taskService.createTask(
        createTestTask({ created_by: 'agent-a', assigned_to: 'agent-a', priority: 3 })
      );

      client.taskService.update(task.id, {
        title: 'Updated title',
        priority: 7,
        assigned_to: 'agent-b',
        updated_by: 'agent-updater',
      });

      const history = client.taskService.getHistory(task.id);
      const byField = Object.fromEntries(history.map((h) => [h.field_name, h]));

      expect(byField['title'].old_value).toBe(task.title);
      expect(byField['title'].new_value).toBe('Updated title');
      expect(byField['priority'].old_value).toBe('3');
      expect(byField['priority'].new_value).toBe('7');
      expect(byField['assigned_to'].old_value).toBe('agent-a');
      expect(byField['assigned_to'].new_value).toBe('agent-b');
      // Every updated field carries the actor
      expect(byField['title'].changed_by).toBe('agent-updater');
      expect(byField['priority'].changed_by).toBe('agent-updater');
    });

    it('does not record entries for updates that change nothing', () => {
      const task = client.taskService.createTask(createTestTask({ title: 'Same title' }));

      client.taskService.update(task.id, { title: 'Same title' });

      const history = client.taskService.getHistory(task.id);
      expect(history).toHaveLength(1); // Only the creation entry
    });

    it('records unchanged-field-free history when only one field changes', () => {
      const task = client.taskService.createTask(createTestTask({ assigned_to: 'agent-1' }));

      client.taskService.update(task.id, { status: 'working' });

      const history = client.taskService.getHistory(task.id);
      const statusEntry = history.find((h) => h.field_name === 'status');
      expect(statusEntry).toBeDefined();
      expect(statusEntry!.old_value).toBe('idle');
      expect(statusEntry!.new_value).toBe('working');
      expect(history.every((h) => h.field_name !== 'assigned_to')).toBe(true);
    });

    it('records the transfer agent as actor on moveTask', () => {
      const task = client.taskService.createTask(
        createTestTask({ assigned_to: 'agent-1', status: 'working' })
      );

      client.taskService.moveTask(task.id, 'agent-1', 'agent-2', 'Handoff');

      const history = client.taskService.getHistory(task.id);
      const assigneeEntry = history.find((h) => h.field_name === 'assigned_to');
      const statusEntry = history.find((h) => h.field_name === 'status');
      expect(assigneeEntry).toBeDefined();
      expect(assigneeEntry!.old_value).toBe('agent-1');
      expect(assigneeEntry!.new_value).toBe('agent-2');
      expect(assigneeEntry!.changed_by).toBe('agent-1');
      expect(statusEntry).toBeDefined();
      expect(statusEntry!.old_value).toBe('working');
      expect(statusEntry!.new_value).toBe('idle');
    });

    it('records queue changes made through the queue service', () => {
      const task = client.taskService.createTask(createTestTask({}));

      client.queueService.addTaskToQueue(task.id, 'ready-for-development');
      client.queueService.moveTaskToQueue(task.id, 'ready-for-qa');
      client.queueService.removeTaskFromQueue(task.id);

      const history = client.taskService.getHistory(task.id);
      const queueEntries = history.filter((h) => h.field_name === 'queue_name');
      expect(queueEntries).toHaveLength(3);
      expect(queueEntries[0].old_value).toBeNull();
      expect(queueEntries[0].new_value).toBe('ready-for-development');
      expect(queueEntries[1].old_value).toBe('ready-for-development');
      expect(queueEntries[1].new_value).toBe('ready-for-qa');
      expect(queueEntries[2].old_value).toBe('ready-for-qa');
      expect(queueEntries[2].new_value).toBeNull();
    });

    it('records an archive entry', () => {
      const task = client.taskService.createTask(createTestTask({}));

      client.taskService.archive(task.id);

      const history = client.taskService.getHistory(task.id);
      const archiveEntry = history.find((h) => h.field_name === 'archived_at');
      expect(archiveEntry).toBeDefined();
      expect(archiveEntry!.old_value).toBeNull();
      expect(archiveEntry!.new_value).not.toBeNull();
    });

    it('returns history in chronological order and throws for unknown tasks', () => {
      const task = client.taskService.createTask(createTestTask({}));
      client.taskService.update(task.id, { status: 'working' });
      client.taskService.update(task.id, { status: 'complete' });

      const history = client.taskService.getHistory(task.id);
      const fieldOrder = history.map((h) => h.field_name);
      expect(fieldOrder.indexOf('created')).toBeLessThan(fieldOrder.indexOf('status'));

      expect(() => client.taskService.getHistory(99999)).toThrow('Task not found: 99999');
    });
  });

  describe('completed_at tracking', () => {
    it('is null for non-complete tasks', () => {
      const task = client.taskService.createTask(createTestTask({}));
      expect(task.completed_at).toBeNull();
    });

    it('is set when a task transitions to complete', () => {
      const task = client.taskService.createTask(createTestTask({}));
      const completed = client.taskService.update(task.id, { status: 'complete' });

      expect(completed.status).toBe('complete');
      expect(completed.completed_at).not.toBeNull();
    });

    it('is preserved when a completed task is updated without reopening', () => {
      const task = client.taskService.createTask(createTestTask({}));
      const completed = client.taskService.update(task.id, { status: 'complete' });
      const touched = client.taskService.update(task.id, {
        title: 'Touched after completion',
      });

      expect(touched.completed_at).toBe(completed.completed_at);
    });

    it('is cleared when a completed task reopens', () => {
      const task = client.taskService.createTask(createTestTask({}));
      client.taskService.update(task.id, { status: 'complete' });
      const reopened = client.taskService.update(task.id, { status: 'working' });

      expect(reopened.status).toBe('working');
      expect(reopened.completed_at).toBeNull();
    });

    it('is set on auto-promoted parents via update() routing', () => {
      const parent = client.taskService.createTask(
        createTestTask({ title: 'Parent' })
      );
      const child1 = client.taskService.createTask(
        createTestTask({ title: 'Child 1', parent_task_id: parent.id })
      );
      client.taskService.createTask(
        createTestTask({ title: 'Child 2', parent_task_id: parent.id })
      );

      // Complete all children -> parent auto-promotes to complete
      client.taskService.update(child1.id, { status: 'complete' });
      const parentBefore = client.taskService.get(parent.id);
      expect(parentBefore!.status).toBe('idle'); // one child still open

      const child2 = client.taskService.getSubtasks(parent.id)[1];
      client.taskService.update(child2.id, { status: 'complete' });

      const parentAfter = client.taskService.get(parent.id);
      expect(parentAfter!.status).toBe('complete');
      expect(parentAfter!.completed_at).not.toBeNull();

      // The promotion is auditable in history with actor 'system'
      const history = client.taskService.getHistory(parent.id);
      const promotion = history.filter(
        (h) => h.field_name === 'status' && h.new_value === 'complete' && h.changed_by === 'system'
      );
      expect(promotion).toHaveLength(1);
    });
  });
});
