/**
 * High-Level Task Tools Integration Tests
 * Tests for signup_for_task and move_task tools
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createTestClient, createTestTask, TestClient } from '../helpers/test-client.js';

describe('High-Level Task Tools', () => {
  let client: TestClient;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.cleanup();
  });

  describe('signupForTask Service Method', () => {
    test('should return first idle task and update to working', () => {
      // Create idle task for agent
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'idle',
        })
      );

      const result = client.taskService.signupForTask('agent-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(task.id);
      expect(result?.status).toBe('working');
      expect(result?.assigned_to).toBe('agent-1');
    });

    test('should return null when no idle tasks available', () => {
      const result = client.taskService.signupForTask('agent-1');

      expect(result).toBeNull();
    });

    test('should respect priority ordering (high priority first)', () => {
      // Create tasks with different priorities
      client.taskService.createTask(
        createTestTask({
          title: 'Low priority',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 1,
        })
      );
      const highPriorityTask = client.taskService.createTask(
        createTestTask({
          title: 'High priority',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 10,
        })
      );
      client.taskService.createTask(
        createTestTask({
          title: 'Medium priority',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 5,
        })
      );

      const result = client.taskService.signupForTask('agent-1');

      expect(result?.id).toBe(highPriorityTask.id);
      expect(result?.title).toBe('High priority');
    });

    test('should respect creation time ordering (older first within same priority)', () => {
      const oldTask = client.taskService.createTask(
        createTestTask({
          title: 'Older task',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 5,
        })
      );
      // Add small delay to ensure different timestamps
      client.taskService.createTask(
        createTestTask({
          title: 'Newer task',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 5,
        })
      );

      const result = client.taskService.signupForTask('agent-1');

      expect(result?.id).toBe(oldTask.id);
      expect(result?.title).toBe('Older task');
    });

    test('should ignore tasks not assigned to agent', () => {
      client.taskService.createTask(
        createTestTask({
          assigned_to: 'other-agent',
          status: 'idle',
        })
      );

      const result = client.taskService.signupForTask('agent-1');

      expect(result).toBeNull();
    });

    test('should ignore archived tasks', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'idle',
        })
      );
      client.taskService.archive(task.id);

      const result = client.taskService.signupForTask('agent-1');

      expect(result).toBeNull();
    });

    test('should ignore tasks already in working status', () => {
      client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );

      const result = client.taskService.signupForTask('agent-1');

      expect(result).toBeNull();
    });

    test('should ignore tasks in complete status', () => {
      client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'complete',
        })
      );

      const result = client.taskService.signupForTask('agent-1');

      expect(result).toBeNull();
    });

    test('should return task with comments and links', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'idle',
        })
      );
      
      // Add comment and link
      client.commentService.addComment({
        task_id: task.id,
        content: 'Test comment',
        created_by: 'system',
      });
      client.linkService.addLink({
        task_id: task.id,
        url: '/test/link',
        description: 'Test link',
      });

      const result = client.taskService.signupForTask('agent-1');

      expect(result).not.toBeNull();
      expect(result?.comments).toHaveLength(1);
      expect(result?.links).toHaveLength(1);
    });

    test('should handle multiple agents without conflicts', () => {
      // Create tasks for different agents
      const task1 = client.taskService.createTask(
        createTestTask({
          title: 'Task for agent-1',
          assigned_to: 'agent-1',
          status: 'idle',
        })
      );
      const task2 = client.taskService.createTask(
        createTestTask({
          title: 'Task for agent-2',
          assigned_to: 'agent-2',
          status: 'idle',
        })
      );

      const result1 = client.taskService.signupForTask('agent-1');
      const result2 = client.taskService.signupForTask('agent-2');

      expect(result1?.id).toBe(task1.id);
      expect(result2?.id).toBe(task2.id);
    });
  });

  describe('moveTask Service Method', () => {
    test('should successfully transfer task from idle status', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'idle',
        })
      );

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        'Transferring to agent-2'
      );

      expect(result.id).toBe(task.id);
      expect(result.assigned_to).toBe('agent-2');
      expect(result.status).toBe('idle');
    });

    test('should successfully transfer task from working status', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        'Transferring to agent-2'
      );

      expect(result.id).toBe(task.id);
      expect(result.assigned_to).toBe('agent-2');
      expect(result.status).toBe('idle');
    });

    test('should change status from working to idle', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        'Handoff comment'
      );

      expect(result.status).toBe('idle');
    });

    test('should keep status as idle when transferring idle task', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'idle',
        })
      );

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        'Handoff comment'
      );

      expect(result.status).toBe('idle');
    });

    test('should add comment with handoff message', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        'Transferring because...'
      );

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].content).toBe('Transferring because...');
      expect(result.comments[0].created_by).toBe('agent-1');
    });

    test('should throw error if task not found', () => {
      expect(() => {
        client.taskService.moveTask(
          999,
          'agent-1',
          'agent-2',
          'Comment'
        );
      }).toThrow('Task not found: 999');
    });

    test('should throw error if current agent does not match', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );

      expect(() => {
        client.taskService.moveTask(
          task.id,
          'wrong-agent',
          'agent-2',
          'Comment'
        );
      }).toThrow(`Task ${task.id} is not assigned to wrong-agent`);
    });

    test('should throw error if task is complete', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'complete',
        })
      );

      expect(() => {
        client.taskService.moveTask(
          task.id,
          'agent-1',
          'agent-2',
          'Comment'
        );
      }).toThrow(`Task ${task.id} with status 'complete' cannot be transferred (only 'idle' or 'working' are allowed)`);
    });

    test('should return task with all comments and links', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );
      
      // Add existing comment and link
      client.commentService.addComment({
        task_id: task.id,
        content: 'Existing comment',
        created_by: 'agent-1',
      });
      client.linkService.addLink({
        task_id: task.id,
        url: '/existing/link',
        description: 'Existing link',
      });

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        'Handoff comment'
      );

      expect(result.comments).toHaveLength(2); // Existing + handoff
      expect(result.links).toHaveLength(1);
    });

    test('should trim comment whitespace', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-1',
          status: 'working',
        })
      );

      const result = client.taskService.moveTask(
        task.id,
        'agent-1',
        'agent-2',
        '  Comment with spaces  '
      );

      expect(result.comments[0].content).toBe('Comment with spaces');
    });
  });

  describe('Workflow Tests', () => {
    test('complete agent handoff workflow', () => {
      // Create task assigned to agent-1
      client.taskService.createTask(
        createTestTask({
          title: 'Handoff workflow test',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 10,
        })
      );

      // Agent 1 signs up for task
      const signedUpTask = client.taskService.signupForTask('agent-1');
      expect(signedUpTask).not.toBeNull();
      expect(signedUpTask?.status).toBe('working');

      // Agent 1 transfers to Agent 2
      const transferredTask = client.taskService.moveTask(
        signedUpTask!.id,
        'agent-1',
        'agent-2',
        'Architecture complete, ready for coding'
      );
      expect(transferredTask.assigned_to).toBe('agent-2');
      expect(transferredTask.status).toBe('idle');
      expect(transferredTask.comments).toHaveLength(1);

      // Agent 2 signs up for transferred task
      const agent2Task = client.taskService.signupForTask('agent-2');
      expect(agent2Task?.id).toBe(signedUpTask?.id);
      expect(agent2Task?.status).toBe('working');
    });

    test('transfer chain (A → B → C)', () => {
      const task = client.taskService.createTask(
        createTestTask({
          assigned_to: 'agent-a',
          status: 'working',
        })
      );

      // A → B
      const taskAtB = client.taskService.moveTask(
        task.id,
        'agent-a',
        'agent-b',
        'From A to B'
      );
      expect(taskAtB.assigned_to).toBe('agent-b');
      expect(taskAtB.comments).toHaveLength(1);

      // B signs up
      const bWorking = client.taskService.signupForTask('agent-b');
      expect(bWorking?.status).toBe('working');

      // B → C
      const taskAtC = client.taskService.moveTask(
        task.id,
        'agent-b',
        'agent-c',
        'From B to C'
      );
      expect(taskAtC.assigned_to).toBe('agent-c');
      expect(taskAtC.comments).toHaveLength(2);

      // Verify comment history
      expect(taskAtC.comments[0].created_by).toBe('agent-a');
      expect(taskAtC.comments[1].created_by).toBe('agent-b');
    });

    test('multiple agents competing for tasks (no conflicts)', () => {
      // Create multiple tasks
      client.taskService.createTask(
        createTestTask({
          title: 'Task 1',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 10,
        })
      );
      client.taskService.createTask(
        createTestTask({
          title: 'Task 2',
          assigned_to: 'agent-1',
          status: 'idle',
          priority: 5,
        })
      );
      client.taskService.createTask(
        createTestTask({
          title: 'Task 3',
          assigned_to: 'agent-2',
          status: 'idle',
          priority: 10,
        })
      );

      // Both agents sign up simultaneously
      const task1 = client.taskService.signupForTask('agent-1');
      const task2 = client.taskService.signupForTask('agent-2');

      expect(task1).not.toBeNull();
      expect(task2).not.toBeNull();
      expect(task1?.title).toBe('Task 1'); // Highest priority for agent-1
      expect(task2?.title).toBe('Task 3');
      
      // Agent 1 can claim second task
      const task3 = client.taskService.signupForTask('agent-1');
      expect(task3?.title).toBe('Task 2');
    });

    test('complete task lifecycle with new tools', () => {
      // Product agent creates task
      const task = client.taskService.createTask(
        createTestTask({
          title: 'Build feature',
          assigned_to: 'architect',
          created_by: 'product',
          priority: 8,
        })
      );

      // Architect signs up
      const architectTask = client.taskService.signupForTask('architect');
      expect(architectTask?.id).toBe(task.id);
      expect(architectTask?.status).toBe('working');

      // Architect adds design doc
      client.linkService.addLink({
        task_id: task.id,
        url: '/docs/design.md',
        description: 'Design document',
        created_by: 'architect',
      });

      // Architect transfers to coder
      const coderTask = client.taskService.moveTask(
        task.id,
        'architect',
        'coder',
        'Design complete, ready for implementation'
      );
      expect(coderTask.assigned_to).toBe('coder');
      expect(coderTask.status).toBe('idle');
      expect(coderTask.links).toHaveLength(1);

      // Coder signs up
      const coding = client.taskService.signupForTask('coder');
      expect(coding?.status).toBe('working');

      // Coder completes
      const complete = client.taskService.updateTask(task.id, {
        status: 'complete',
      });
      expect(complete.status).toBe('complete');

      // Cannot transfer complete task
      expect(() => {
        client.taskService.moveTask(
          task.id,
          'coder',
          'reviewer',
          'Should fail'
        );
      }).toThrow(`Task ${task.id} with status 'complete' cannot be transferred (only 'idle' or 'working' are allowed)`);
    });
  });
});
