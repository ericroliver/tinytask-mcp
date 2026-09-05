/**
 * Performance and Load Tests
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createTestClient, createTestTask, TestClient } from '../helpers/test-client.js';

describe('Performance', () => {
  let client: TestClient;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.cleanup();
  });

  test('Handles 100+ tasks efficiently', () => {
    const start = Date.now();

    // Create 100 tasks
    const taskIds: number[] = [];
    for (let i = 0; i < 100; i++) {
      const task = client.taskService.createTask(
        createTestTask({
          title: `Task ${i}`,
          assigned_to: `agent-${i % 10}`,
          priority: i % 20,
        })
      );
      taskIds.push(task.id);
    }

    const createTime = Date.now() - start;
    expect(createTime).toBeLessThan(10000); // < 10s for 100 tasks

    // Query performance
    const queryStart = Date.now();
    const queue = client.taskService.getMyQueue('agent-1');
    const queryTime = Date.now() - queryStart;

    expect(queryTime).toBeLessThan(100); // < 100ms for queue query
    expect(queue.tasks.length).toBeGreaterThan(0);

    // Verify all tasks were created
    expect(taskIds).toHaveLength(100);
  });

  test('List tasks performance with 100+ tasks', () => {
    // Create 150 tasks
    for (let i = 0; i < 150; i++) {
      client.taskService.createTask(
        createTestTask({
          title: `Task ${i}`,
          status: i % 3 === 0 ? 'complete' : 'idle',
        })
      );
    }

    const start = Date.now();
    const tasks = client.taskService.listTasks();
    const queryTime = Date.now() - start;

    expect(queryTime).toBeLessThan(200); // < 200ms
    expect(tasks).toHaveLength(100); // default limit caps list results
    expect(client.taskService.listTasks({ limit: 150 })).toHaveLength(150);
  });

  test('Individual task retrieval performance', () => {
    // Create 50 tasks
    const taskIds: number[] = [];
    for (let i = 0; i < 50; i++) {
      const task = client.taskService.createTask(
        createTestTask({ title: `Task ${i}` })
      );
      taskIds.push(task.id);
    }

    // Measure retrieval time
    const retrievalTimes: number[] = [];
    for (const taskId of taskIds) {
      const start = Date.now();
      client.taskService.getTask(taskId);
      retrievalTimes.push(Date.now() - start);
    }

    const avgTime = retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length;
    expect(avgTime).toBeLessThan(10); // < 10ms average
  });

  test('Update performance with many tasks', () => {
    // Create 100 tasks
    const taskIds: number[] = [];
    for (let i = 0; i < 100; i++) {
      const task = client.taskService.createTask(
        createTestTask({ title: `Task ${i}` })
      );
      taskIds.push(task.id);
    }

    // Update all tasks
    const start = Date.now();
    for (const taskId of taskIds) {
      client.taskService.updateTask(taskId, { status: 'working' });
    }
    const updateTime = Date.now() - start;

    expect(updateTime).toBeLessThan(5000); // < 5s for 100 updates

    // Verify updates
    const firstTask = client.taskService.getTask(taskIds[0]);
    expect(firstTask?.status).toBe('working');
  });

  test('Queue performance with multiple agents', () => {
    // Create 200 tasks distributed across 20 agents
    for (let i = 0; i < 200; i++) {
      client.taskService.createTask(
        createTestTask({
          title: `Task ${i}`,
          assigned_to: `agent-${i % 20}`,
        })
      );
    }

    // Query each agent's queue
    const queryTimes: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      const queue = client.taskService.getMyQueue(`agent-${i}`);
      queryTimes.push(Date.now() - start);
      expect(queue.tasks).toHaveLength(10); // Each agent should have 10 tasks
    }

    const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
    expect(avgQueryTime).toBeLessThan(50); // < 50ms average
  });

  test('Comment and link creation performance', () => {
    // Create a task
    const task = client.taskService.createTask(
      createTestTask({ title: 'Performance test task' })
    );

    // Add 50 comments
    const commentStart = Date.now();
    for (let i = 0; i < 50; i++) {
      client.commentService.addComment({
        task_id: task.id,
        content: `Comment ${i}`,
        created_by: 'test-agent',
      });
    }
    const commentTime = Date.now() - commentStart;
    expect(commentTime).toBeLessThan(2000); // < 2s for 50 comments

    // Add 50 links
    const linkStart = Date.now();
    for (let i = 0; i < 50; i++) {
      client.linkService.addLink({
        task_id: task.id,
        url: `/link/${i}`,
        description: `Link ${i}`,
        created_by: 'test-agent',
      });
    }
    const linkTime = Date.now() - linkStart;
    expect(linkTime).toBeLessThan(2000); // < 2s for 50 links

    // Verify retrieval performance with relationships
    const retrievalStart = Date.now();
    const retrieved = client.taskService.getTask(task.id, true);
    const retrievalTime = Date.now() - retrievalStart;

    expect(retrievalTime).toBeLessThan(100); // < 100ms even with many relationships
    expect(retrieved?.comments).toHaveLength(50);
    expect(retrieved?.links).toHaveLength(50);
  });

  test('Large dataset query performance', () => {
    // Create 500 tasks
    for (let i = 0; i < 500; i++) {
      client.taskService.createTask(
        createTestTask({
          title: `Task ${i}`,
          status: i % 3 === 0 ? 'complete' : 'idle',
          assigned_to: `agent-${i % 25}`,
        })
      );
    }

    // Test various query patterns
    const start1 = Date.now();
    const allTasks = client.taskService.listTasks();
    const listTime = Date.now() - start1;
    expect(listTime).toBeLessThan(500); // < 500ms
    expect(allTasks).toHaveLength(100); // default limit caps list results
    expect(client.taskService.listTasks({ limit: 500 })).toHaveLength(500);

    // Queue query should still be fast
    const start2 = Date.now();
    const queue = client.taskService.getMyQueue('agent-0');
    const queueTime = Date.now() - start2;
    expect(queueTime).toBeLessThan(100); // < 100ms
    expect(queue.tasks.length).toBeGreaterThan(0);
  });

  test('Concurrent operations performance', () => {
    // Create initial tasks
    const taskIds: number[] = [];
    for (let i = 0; i < 50; i++) {
      const task = client.taskService.createTask(
        createTestTask({ title: `Task ${i}` })
      );
      taskIds.push(task.id);
    }

    const start = Date.now();

    // Simulate concurrent operations
    for (let i = 0; i < 50; i++) {
      // Update task
      client.taskService.updateTask(taskIds[i], { status: 'working' });
      
      // Add comment
      client.commentService.addComment({
        task_id: taskIds[i],
        content: `Comment for task ${i}`,
        created_by: 'test-agent',
      });
      
      // Query task
      client.taskService.getTask(taskIds[i]);
    }

    const operationTime = Date.now() - start;
    expect(operationTime).toBeLessThan(3000); // < 3s for 150 operations
  });
});
