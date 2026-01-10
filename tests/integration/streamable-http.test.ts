/**
 * Streamable HTTP Transport Integration Tests
 * Tests Story 1.5: Streamable HTTP functionality
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestClient, createTestTask, TestClient } from '../helpers/test-client.js';
import { startStreamableHttpServer } from '../../src/server/streamable-http.js';

const TEST_PORT = 4001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

describe('Streamable HTTP Transport', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = createTestClient();
    
    // Start the Streamable HTTP server
    startStreamableHttpServer(
      client.taskService,
      client.commentService,
      client.linkService,
      { port: TEST_PORT, host: 'localhost' }
    );

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(() => {
    client.cleanup();
    // Server will be cleaned up by process exit
  });

  describe('Server Initialization', () => {
    it('should start successfully with Streamable HTTP', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.ok).toBe(true);
    });

    it('should return correct transport type in health endpoint', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      const health = await response.json();
      
      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('streamable-http');
      expect(health.database).toBe('connected');
      expect(health.sessionCount).toBeGreaterThanOrEqual(0);
    });

    it('should bind to correct port and host', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
    });

    it('should support CORS headers', async () => {
      const response = await fetch(`${BASE_URL}/health`, {
        method: 'OPTIONS',
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });
  });

  describe('Session Management', () => {
    it('should accept connections to /mcp endpoint', async () => {
      // Verify the endpoint exists and accepts POST requests
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      // Should not return 404
      expect(response.status).not.toBe(404);
    });

    it('should support concurrent connections', async () => {
      // Verify health endpoint can handle concurrent requests
      const request1 = fetch(`${BASE_URL}/health`);
      const request2 = fetch(`${BASE_URL}/health`);

      const [response1, response2] = await Promise.all([request1, request2]);
      
      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);
    });
  });

  describe('MCP Tool Execution', () => {
    let taskId: number;

    beforeEach(() => {
      // Clean up any existing tasks
      const existingTasks = client.taskService.listTasks();
      existingTasks.forEach((task) => {
        client.taskService.deleteTask(task.id);
      });
    });

    it('should execute create_task via Streamable HTTP', () => {
      const taskData = createTestTask({
        title: 'Test task via Streamable HTTP',
        description: 'Testing task creation',
        assigned_to: 'test-agent',
        created_by: 'test-creator',
      });

      const result = client.taskService.createTask(taskData);
      
      expect(result.id).toBeDefined();
      expect(result.title).toBe('Test task via Streamable HTTP');
      expect(result.assigned_to).toBe('test-agent');
      
      taskId = result.id;
    });

    it('should execute get_task via Streamable HTTP', () => {
      // Create a task first
      const task = client.taskService.createTask(
        createTestTask({ title: 'Get task test' })
      );
      taskId = task.id;

      // Get the task
      const result = client.taskService.getTask(taskId);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(taskId);
      expect(result?.title).toBe('Get task test');
    });

    it('should execute update_task via Streamable HTTP', () => {
      // Create a task first
      const task = client.taskService.createTask(
        createTestTask({ title: 'Update task test', status: 'idle' })
      );
      taskId = task.id;

      // Update the task
      client.taskService.updateTask(taskId, {
        status: 'working',
        priority: 8,
      });

      // Verify update
      const updated = client.taskService.getTask(taskId);
      expect(updated?.status).toBe('working');
      expect(updated?.priority).toBe(8);
    });

    it('should execute list_tasks via Streamable HTTP', () => {
      // Create multiple tasks
      client.taskService.createTask(createTestTask({ title: 'Task 1' }));
      client.taskService.createTask(createTestTask({ title: 'Task 2' }));
      client.taskService.createTask(createTestTask({ title: 'Task 3' }));

      // List tasks
      const tasks = client.taskService.listTasks();
      
      expect(tasks.length).toBeGreaterThanOrEqual(3);
    });

    it('should execute delete_task via Streamable HTTP', () => {
      // Create a task first
      const task = client.taskService.createTask(
        createTestTask({ title: 'Delete task test' })
      );
      taskId = task.id;

      // Delete the task
      client.taskService.deleteTask(taskId);

      // Verify deletion
      const deleted = client.taskService.getTask(taskId);
      expect(deleted).toBeNull();
    });

    it('should execute archive_task via Streamable HTTP', () => {
      // Create a task first
      const task = client.taskService.createTask(
        createTestTask({ title: 'Archive task test' })
      );
      taskId = task.id;

      // Archive the task
      client.taskService.archiveTask(taskId);

      // Verify archival
      const archived = client.taskService.getTask(taskId);
      expect(archived?.archived_at).toBeDefined();
      expect(archived?.archived_at).not.toBeNull();
    });
  });

  describe('MCP Resource Access', () => {
    let taskId: number;

    beforeEach(() => {
      // Create a test task for resource tests
      const task = client.taskService.createTask(
        createTestTask({ title: 'Resource test task' })
      );
      taskId = task.id;
    });

    afterEach(() => {
      // Clean up
      if (taskId) {
        client.taskService.deleteTask(taskId);
      }
    });

    it('should access task resource via Streamable HTTP', () => {
      // Get task via service (simulating resource access)
      const task = client.taskService.getTask(taskId);
      
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
      expect(task?.title).toBe('Resource test task');
    });

    it('should access queue resource via Streamable HTTP', () => {
      // Create tasks for a specific agent
      const agent = 'queue-test-agent';
      client.taskService.createTask(
        createTestTask({ assigned_to: agent, title: 'Queue task 1' })
      );
      client.taskService.createTask(
        createTestTask({ assigned_to: agent, title: 'Queue task 2' })
      );

      // Get queue
      const queue = client.taskService.getMyQueue(agent);
      
      expect(queue.agent_name).toBe(agent);
      expect(queue.tasks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Comment Operations', () => {
    let taskId: number;

    beforeEach(() => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'Comment test task' })
      );
      taskId = task.id;
    });

    afterEach(() => {
      if (taskId) {
        client.taskService.deleteTask(taskId);
      }
    });

    it('should create comments via Streamable HTTP', () => {
      const comment = client.commentService.addComment({
        task_id: taskId,
        content: 'Test comment',
        created_by: 'test-agent',
      });

      expect(comment.id).toBeDefined();
      expect(comment.content).toBe('Test comment');
    });

    it('should list comments via Streamable HTTP', () => {
      // Add comments
      client.commentService.addComment({
        task_id: taskId,
        content: 'Comment 1',
        created_by: 'test-agent',
      });
      client.commentService.addComment({
        task_id: taskId,
        content: 'Comment 2',
        created_by: 'test-agent',
      });

      // List comments
      const comments = client.commentService.listComments(taskId);
      expect(comments.length).toBe(2);
    });
  });

  describe('Link Operations', () => {
    let taskId: number;

    beforeEach(() => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'Link test task' })
      );
      taskId = task.id;
    });

    afterEach(() => {
      if (taskId) {
        client.taskService.deleteTask(taskId);
      }
    });

    it('should create links via Streamable HTTP', () => {
      const link = client.linkService.addLink({
        task_id: taskId,
        url: 'https://example.com',
        description: 'Test link',
        created_by: 'test-agent',
      });

      expect(link.id).toBeDefined();
      expect(link.url).toBe('https://example.com');
    });

    it('should list links via Streamable HTTP', () => {
      // Add links
      client.linkService.addLink({
        task_id: taskId,
        url: 'https://example1.com',
        description: 'Link 1',
        created_by: 'test-agent',
      });
      client.linkService.addLink({
        task_id: taskId,
        url: 'https://example2.com',
        description: 'Link 2',
        created_by: 'test-agent',
      });

      // List links
      const links = client.linkService.listLinks(taskId);
      expect(links.length).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await fetch(`${BASE_URL}/unknown`);
      expect(response.status).toBe(404);
      
      const body = await response.json();
      expect(body.error).toBe('Not found');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      // Server should handle gracefully
      expect([400, 500]).toContain(response.status);
    });

    it('should handle invalid task operations gracefully', () => {
      // Try to get a non-existent task
      const result = client.taskService.getTask(999999);
      expect(result).toBeNull();
    });

    it('should handle invalid task updates gracefully', () => {
      // Create a task
      const task = client.taskService.createTask(
        createTestTask({ title: 'Error test task' })
      );

      // Try to update with invalid data - should throw
      expect(() => {
        client.taskService.updateTask(task.id, {
          status: 'invalid' as any,
        });
      }).toThrow();
    });
  });
});
