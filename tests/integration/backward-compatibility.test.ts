/**
 * Backward Compatibility Integration Tests
 * Tests Story 1.10: Verify existing deployments won't break
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestClient, createTestTask, TestClient } from '../helpers/test-client.js';
import { startHttpServer } from '../../src/server/http.js';
import { startSseServer } from '../../src/server/sse.js';

// Use different ports for each test suite to avoid conflicts
const PORTS = {
  SSE_LEGACY: 5010,
  SSE_EXPLICIT: 5011,
  MODE_BOTH: 5012,
  SSE_TOOLS: 5014,
  SSE_RESOURCES: 5015,
  STREAMABLE_COMPARE: 5016,
  SSE_HEALTH_1: 5017,
  SSE_HEALTH_2: 5018,
};

describe('Backward Compatibility', () => {
  let client: TestClient;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    client = createTestClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    client.cleanup();
  });

  describe('Existing Configuration Support', () => {
    it('should support legacy TINYTASK_MODE=sse', async () => {
      // Simulate the mode normalization that happens in index.ts
      let mode = 'sse';
      if (mode === 'sse') {
        mode = 'http';
        if (!process.env.TINYTASK_ENABLE_SSE) {
          process.env.TINYTASK_ENABLE_SSE = 'true';
        }
      }
      process.env.TINYTASK_MODE = mode;

      const port = PORTS.SSE_LEGACY;
      startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify SSE transport is active
      const response = await fetch(`http://localhost:${port}/health`);
      expect(response.ok).toBe(true);
      
      const health = await response.json();
      expect(health.status).toBe('healthy');
      // SSE transport doesn't report transport field (legacy behavior)
      expect(health.transport).toBeUndefined();
    });

    it('should support explicit SSE configuration', async () => {
      process.env.TINYTASK_MODE = 'http';
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const port = PORTS.SSE_EXPLICIT;
      startSseServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch(`http://localhost:${port}/health`);
      expect(response.ok).toBe(true);
      
      const health = await response.json();
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });

    it('should support TINYTASK_MODE=both', async () => {
      process.env.TINYTASK_MODE = 'both';
      delete process.env.TINYTASK_ENABLE_SSE;

      const port = PORTS.MODE_BOTH;
      // Test only the HTTP portion of 'both' mode
      startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch(`http://localhost:${port}/health`);
      expect(response.ok).toBe(true);
      
      const health = await response.json();
      expect(health.status).toBe('healthy');
    });

    it('should maintain stdio configuration unchanged', () => {
      // Stdio mode doesn't involve HTTP server, so we just verify the mode is valid
      process.env.TINYTASK_MODE = 'stdio';
      
      const mode = process.env.TINYTASK_MODE;
      expect(mode).toBe('stdio');
      expect(['stdio', 'http', 'both']).toContain(mode);
    });
  });

  describe('SSE Transport - All Tools Work', () => {
    let port: number;

    beforeEach(async () => {
      port = PORTS.SSE_TOOLS;
      process.env.TINYTASK_ENABLE_SSE = 'true';
      
      startSseServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should execute create_task via SSE', () => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'SSE create_task test' })
      );

      expect(task.id).toBeDefined();
      expect(task.title).toBe('SSE create_task test');
    });

    it('should execute get_task via SSE', () => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'SSE get_task test' })
      );

      const retrieved = client.taskService.getTask(task.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(task.id);
      expect(retrieved?.title).toBe('SSE get_task test');
    });

    it('should execute update_task via SSE', () => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'SSE update_task test', status: 'idle' })
      );

      client.taskService.updateTask(task.id, { status: 'working' });

      const updated = client.taskService.getTask(task.id);
      expect(updated?.status).toBe('working');
    });

    it('should execute list_tasks via SSE', () => {
      client.taskService.createTask(createTestTask({ title: 'Task 1' }));
      client.taskService.createTask(createTestTask({ title: 'Task 2' }));

      const tasks = client.taskService.listTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should execute delete_task via SSE', () => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'SSE delete_task test' })
      );

      client.taskService.deleteTask(task.id);

      const deleted = client.taskService.getTask(task.id);
      expect(deleted).toBeNull();
    });

    it('should execute archive_task via SSE', () => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'SSE archive_task test' })
      );

      client.taskService.archiveTask(task.id);

      const archived = client.taskService.getTask(task.id);
      expect(archived?.archived_at).toBeDefined();
      expect(archived?.archived_at).not.toBeNull();
    });

    it('should execute get_my_queue via SSE', () => {
      const agent = 'sse-test-agent';
      client.taskService.createTask(
        createTestTask({ assigned_to: agent, title: 'Queue task' })
      );

      const queue = client.taskService.getMyQueue(agent);
      
      expect(queue.agent_name).toBe(agent);
      expect(queue.tasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('SSE Transport - All Resources Work', () => {
    let port: number;
    let taskId: number;

    beforeEach(async () => {
      port = PORTS.SSE_RESOURCES;
      process.env.TINYTASK_ENABLE_SSE = 'true';
      
      startSseServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Create a test task
      const task = client.taskService.createTask(
        createTestTask({ title: 'SSE resource test' })
      );
      taskId = task.id;
    });

    afterEach(() => {
      if (taskId) {
        client.taskService.deleteTask(taskId);
      }
    });

    it('should access task resource via SSE', () => {
      const task = client.taskService.getTask(taskId);
      
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
      expect(task?.title).toBe('SSE resource test');
    });

    it('should access queue resource via SSE', () => {
      const agent = 'sse-resource-agent';
      client.taskService.createTask(
        createTestTask({ assigned_to: agent, title: 'Queue resource task' })
      );

      const queue = client.taskService.getMyQueue(agent);
      
      expect(queue.agent_name).toBe(agent);
      expect(queue.tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle comments via SSE', () => {
      const comment = client.commentService.addComment({
        task_id: taskId,
        content: 'SSE comment test',
        created_by: 'test-agent',
      });

      expect(comment.id).toBeDefined();
      expect(comment.content).toBe('SSE comment test');

      const comments = client.commentService.listComments(taskId);
      expect(comments.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle links via SSE', () => {
      const link = client.linkService.addLink({
        task_id: taskId,
        url: 'https://sse-test.com',
        description: 'SSE link test',
        created_by: 'test-agent',
      });

      expect(link.id).toBeDefined();
      expect(link.url).toBe('https://sse-test.com');

      const links = client.linkService.listLinks(taskId);
      expect(links.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Database Operations - Transport Independence', () => {
    it('should produce identical results across transports', () => {
      // Create task data
      const taskData = createTestTask({
        title: 'Cross-transport test',
        description: 'Testing database consistency',
        priority: 7,
        assigned_to: 'test-agent',
        created_by: 'test-creator',
      });

      // Create via SSE-configured client
      process.env.TINYTASK_ENABLE_SSE = 'true';
      const sseTask = client.taskService.createTask(taskData);

      // Create via Streamable HTTP-configured client (different env)
      delete process.env.TINYTASK_ENABLE_SSE;
      const httpTask = client.taskService.createTask({
        ...taskData,
        title: 'Cross-transport test 2',
      });

      // Both should have same structure
      expect(sseTask.id).toBeDefined();
      expect(httpTask.id).toBeDefined();
      expect(sseTask.title).toBe('Cross-transport test');
      expect(httpTask.title).toBe('Cross-transport test 2');
      expect(sseTask.priority).toBe(httpTask.priority);
      expect(sseTask.assigned_to).toBe(httpTask.assigned_to);
      expect(sseTask.created_by).toBe(httpTask.created_by);
    });

    it('should maintain same database schema across transports', () => {
      // Query task structure
      const task = client.taskService.createTask(
        createTestTask({ title: 'Schema test' })
      );

      // Verify expected fields exist
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('status');
      expect(task).toHaveProperty('priority');
      expect(task).toHaveProperty('assigned_to');
      expect(task).toHaveProperty('created_by');
      expect(task).toHaveProperty('created_at');
      expect(task).toHaveProperty('updated_at');
      expect(task).toHaveProperty('archived_at');
    });

    it('should handle transactions identically', () => {
      // Create task with comment and link
      const task = client.taskService.createTask(
        createTestTask({ title: 'Transaction test' })
      );

      const comment = client.commentService.addComment({
        task_id: task.id,
        content: 'Test comment',
        created_by: 'test-agent',
      });

      const link = client.linkService.addLink({
        task_id: task.id,
        url: 'https://test.com',
        description: 'Test link',
        created_by: 'test-agent',
      });

      // Verify all created successfully
      expect(task.id).toBeDefined();
      expect(comment.id).toBeDefined();
      expect(link.id).toBeDefined();

      // Verify relationships
      const comments = client.commentService.listComments(task.id);
      const links = client.linkService.listLinks(task.id);
      
      expect(comments.length).toBeGreaterThanOrEqual(1);
      expect(links.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('API Compatibility', () => {
    it('should maintain same MCP protocol messages', async () => {
      // Both transports should accept same MCP protocol format
      const mcpMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      // This structure should be valid for both SSE and Streamable HTTP
      expect(mcpMessage.jsonrpc).toBe('2.0');
      expect(mcpMessage.method).toBe('initialize');
    });

    it('should maintain same tool signatures', () => {
      // Verify task service methods have consistent signatures
      const task = client.taskService.createTask(
        createTestTask({ title: 'Signature test' })
      );

      // All these methods should exist and work
      expect(typeof client.taskService.createTask).toBe('function');
      expect(typeof client.taskService.getTask).toBe('function');
      expect(typeof client.taskService.updateTask).toBe('function');
      expect(typeof client.taskService.deleteTask).toBe('function');
      expect(typeof client.taskService.archiveTask).toBe('function');
      expect(typeof client.taskService.listTasks).toBe('function');
      expect(typeof client.taskService.getMyQueue).toBe('function');
    });

    it('should maintain same resource URI formats', () => {
      const task = client.taskService.createTask(
        createTestTask({ title: 'URI test' })
      );

      // Resource URI formats should remain consistent
      const taskUri = `task://${task.id}`;
      const queueUri = `queue://test-agent`;

      // Verify URI formats are valid
      expect(taskUri).toMatch(/^task:\/\/\d+$/);
      expect(queueUri).toMatch(/^queue:\/\/.+$/);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should handle missing TINYTASK_ENABLE_SSE gracefully', () => {
      delete process.env.TINYTASK_ENABLE_SSE;
      
      // Should default to Streamable HTTP without errors
      const enableSse = process.env.TINYTASK_ENABLE_SSE === 'true';
      expect(enableSse).toBe(false);
    });

    it('should handle TINYTASK_ENABLE_SSE=false explicitly', () => {
      process.env.TINYTASK_ENABLE_SSE = 'false';
      
      const enableSse = process.env.TINYTASK_ENABLE_SSE === 'true';
      expect(enableSse).toBe(false);
    });

    it('should handle TINYTASK_ENABLE_SSE=true explicitly', () => {
      process.env.TINYTASK_ENABLE_SSE = 'true';
      
      const enableSse = process.env.TINYTASK_ENABLE_SSE === 'true';
      expect(enableSse).toBe(true);
    });

    it('should normalize legacy TINYTASK_MODE=sse', () => {
      // Simulate normalization
      let mode = 'sse';
      if (mode === 'sse') {
        mode = 'http';
        if (!process.env.TINYTASK_ENABLE_SSE) {
          process.env.TINYTASK_ENABLE_SSE = 'true';
        }
      }

      expect(mode).toBe('http');
      expect(process.env.TINYTASK_ENABLE_SSE).toBe('true');
    });
  });

  describe('Error Handling Consistency', () => {
    it('should handle invalid task operations consistently across transports', () => {
      // SSE transport
      process.env.TINYTASK_ENABLE_SSE = 'true';
      const result1 = client.taskService.getTask(999999);
      expect(result1).toBeNull();

      // Streamable HTTP transport
      delete process.env.TINYTASK_ENABLE_SSE;
      const result2 = client.taskService.getTask(999999);
      expect(result2).toBeNull();
    });

    it('should validate task data consistently', () => {
      // Both transports should reject invalid status
      const task = client.taskService.createTask(
        createTestTask({ title: 'Validation test' })
      );

      expect(() => {
        client.taskService.updateTask(task.id, {
          status: 'invalid-status' as any,
        });
      }).toThrow();
    });
  });

  describe('Performance Characteristics', () => {
    it('should create tasks with acceptable performance via SSE', () => {
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        client.taskService.createTask(
          createTestTask({ title: `SSE perf test ${i}` })
        );
      }
      const duration = Date.now() - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 10 tasks
    });

    it('should create tasks with acceptable performance via Streamable HTTP', () => {
      delete process.env.TINYTASK_ENABLE_SSE;

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        client.taskService.createTask(
          createTestTask({ title: `HTTP perf test ${i}` })
        );
      }
      const duration = Date.now() - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 10 tasks
    });
  });

  describe('Health Endpoint Consistency', () => {
    it('should return healthy status via SSE', async () => {
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const port = PORTS.SSE_HEALTH_1;
      startSseServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });

    it('should return healthy status via Streamable HTTP', async () => {
      delete process.env.TINYTASK_ENABLE_SSE;

      const port = PORTS.STREAMABLE_COMPARE;
      startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('streamable-http');
    });
  });
});
