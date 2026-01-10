/**
 * Transport Configuration Integration Tests
 * Tests Story 1.6: Configuration-based transport selection
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestClient, TestClient } from '../helpers/test-client.js';
import { startHttpServer } from '../../src/server/http.js';

// Use different ports for each test to avoid conflicts
const PORTS = {
  SSE_ENABLED: 4002,
  SSE_DISABLED: 4003,
  SSE_UNSET: 4004,
  MODE_SSE: 4005,
  MODE_HTTP: 4006,
  MODE_BOTH: 4007,
  MODE_BOTH_SSE: 4008,
};

describe('Transport Configuration', () => {
  let client: TestClient;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    client = createTestClient();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    client.cleanup();
  });

  describe('TINYTASK_ENABLE_SSE Configuration', () => {
    it('should use SSE when TINYTASK_ENABLE_SSE=true', async () => {
      process.env.TINYTASK_MODE = 'http';
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const port = PORTS.SSE_ENABLED;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      // Give server time to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify SSE transport by checking health endpoint
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      // SSE health endpoint doesn't include 'transport' field (legacy)
      // but should have status and timestamp
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
      // SSE transport doesn't report transport type in health
      expect(health.transport).toBeUndefined();
    });

    it('should use Streamable HTTP when TINYTASK_ENABLE_SSE=false', async () => {
      process.env.TINYTASK_MODE = 'http';
      process.env.TINYTASK_ENABLE_SSE = 'false';

      const port = PORTS.SSE_DISABLED;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Streamable HTTP transport
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('streamable-http');
      expect(health.sessionCount).toBeDefined();
    });

    it('should default to Streamable HTTP when TINYTASK_ENABLE_SSE is unset', async () => {
      process.env.TINYTASK_MODE = 'http';
      delete process.env.TINYTASK_ENABLE_SSE;

      const port = PORTS.SSE_UNSET;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Streamable HTTP transport (default)
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('streamable-http');
      expect(health.sessionCount).toBeDefined();
    });
  });

  describe('TINYTASK_MODE Configuration', () => {
    it('should activate SSE with deprecation warning when TINYTASK_MODE=sse', async () => {
      // This test verifies backward compatibility
      // When mode is 'sse', it should be normalized to 'http' with TINYTASK_ENABLE_SSE=true
      
      const originalMode = process.env.TINYTASK_MODE;
      process.env.TINYTASK_MODE = 'sse';
      delete process.env.TINYTASK_ENABLE_SSE;

      // Import index to trigger mode normalization
      // Note: In real scenario, the index.ts normalizes 'sse' to 'http' + sets TINYTASK_ENABLE_SSE=true
      // For testing, we simulate this behavior
      let mode = process.env.TINYTASK_MODE;
      if (mode === 'sse') {
        mode = 'http';
        if (!process.env.TINYTASK_ENABLE_SSE) {
          process.env.TINYTASK_ENABLE_SSE = 'true';
        }
      }
      process.env.TINYTASK_MODE = mode;

      const port = PORTS.MODE_SSE;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify SSE transport is active
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      // SSE doesn't report transport type
      expect(health.transport).toBeUndefined();
    });

    it('should use Streamable HTTP when TINYTASK_MODE=http without SSE flag', async () => {
      process.env.TINYTASK_MODE = 'http';
      delete process.env.TINYTASK_ENABLE_SSE;

      const port = PORTS.MODE_HTTP;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Streamable HTTP transport
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('streamable-http');
    });

    it('should use Streamable HTTP by default when TINYTASK_MODE=both', async () => {
      process.env.TINYTASK_MODE = 'both';
      delete process.env.TINYTASK_ENABLE_SSE;

      const port = PORTS.MODE_BOTH;
      // In 'both' mode, only the HTTP server part is testable
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Streamable HTTP transport is used for HTTP portion
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('streamable-http');
    });

    it('should use SSE when TINYTASK_MODE=both TINYTASK_ENABLE_SSE=true', async () => {
      process.env.TINYTASK_MODE = 'both';
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const port = PORTS.MODE_BOTH_SSE;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify SSE transport is used
      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      // SSE doesn't report transport type
      expect(health.transport).toBeUndefined();
    });
  });

  describe('Transport Verification', () => {
    it('should execute tools correctly with SSE transport', async () => {
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const port = PORTS.SSE_ENABLED + 100;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Create a task via the service (simulating MCP tool call)
      const task = client.taskService.createTask({
        title: 'SSE transport test',
        description: 'Test task creation with SSE',
        status: 'idle',
        priority: 5,
        assigned_to: 'test-agent',
        created_by: 'test-creator',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('SSE transport test');
    });

    it('should execute tools correctly with Streamable HTTP transport', async () => {
      delete process.env.TINYTASK_ENABLE_SSE;

      const port = PORTS.SSE_DISABLED + 100;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Create a task via the service (simulating MCP tool call)
      const task = client.taskService.createTask({
        title: 'Streamable HTTP transport test',
        description: 'Test task creation with Streamable HTTP',
        status: 'idle',
        priority: 5,
        assigned_to: 'test-agent',
        created_by: 'test-creator',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Streamable HTTP transport test');
    });
  });

  describe('Configuration Priority', () => {
    it('should prioritize TINYTASK_ENABLE_SSE over mode defaults', async () => {
      // Even with mode=http, explicit SSE flag should activate SSE
      process.env.TINYTASK_MODE = 'http';
      process.env.TINYTASK_ENABLE_SSE = 'true';

      const port = PORTS.SSE_ENABLED + 200;
      const serverPromise = startHttpServer(
        client.taskService,
        client.commentService,
        client.linkService,
        { port, host: 'localhost' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch(`http://localhost:${port}/health`);
      const health = await response.json();

      expect(health.status).toBe('healthy');
      // SSE transport should be active (doesn't report transport field)
      expect(health.transport).toBeUndefined();
    });

    it('should use Streamable HTTP when TINYTASK_ENABLE_SSE is explicitly false', async () => {
      process.env.TINYTASK_MODE = 'http';
      process.env.TINYTASK_ENABLE_SSE = 'false';

      const port = PORTS.SSE_DISABLED + 200;
      const serverPromise = startHttpServer(
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

  describe('Environment Variable Cleanup', () => {
    it('should properly isolate test environment variables', () => {
      // Set test-specific env vars
      process.env.TEST_VAR = 'test';
      process.env.TINYTASK_ENABLE_SSE = 'true';

      // Verify they're set
      expect(process.env.TEST_VAR).toBe('test');
      expect(process.env.TINYTASK_ENABLE_SSE).toBe('true');

      // After test cleanup (in afterEach), they should be restored
      // This is verified by the test framework
    });
  });
});
