/**
 * Transport Performance Comparison Tests
 * Measures and compares SSE vs Streamable HTTP transport performance
 * Story 1.9: Performance Testing and Comparison
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, createTestTask, TestClient } from '../helpers/test-client.js';
import { startSseServer } from '../../src/server/sse.js';
import { startStreamableHttpServer } from '../../src/server/streamable-http.js';

// Test configuration
const SSE_PORT = 6001;
const STREAMABLE_PORT = 6002;
const SSE_URL = `http://localhost:${SSE_PORT}`;
const STREAMABLE_URL = `http://localhost:${STREAMABLE_PORT}`;

// Performance metrics storage
interface PerformanceMetrics {
  transport: 'SSE' | 'Streamable HTTP';
  requestsPerSecond: number;
  concurrentSessions: number;
  memoryUsageMB: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  connectionSetupTime: number;
}

const metrics: PerformanceMetrics[] = [];

/**
 * Calculate percentiles from sorted array
 */
function calculatePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
  const sorted = values.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { p50, p95, p99 };
}

/**
 * Measure memory usage in MB
 */
function measureMemory(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.heapUsed / 1024 / 1024);
}

/**
 * Wait for server startup
 */
async function waitForServer(url: string, maxAttempts = 20): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} failed to start`);
}

/**
 * Create a task via HTTP API
 */
async function createTaskViaHttp(baseUrl: string, title: string): Promise<number> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: {
          title,
          status: 'idle',
          priority: 0,
        },
      },
    }),
  });

  const data = await response.json();
  return data.result?.content?.[0]?.text ? 
    JSON.parse(data.result.content[0].text).id : 
    -1;
}

/**
 * Get task via HTTP API
 */
async function getTaskViaHttp(baseUrl: string, taskId: number): Promise<void> {
  await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'get_task',
        arguments: { id: taskId },
      },
    }),
  });
}

describe('Transport Performance Comparison', () => {
  let sseClient: TestClient;
  let streamableClient: TestClient;

  beforeAll(async () => {
    // Create separate clients for each transport
    sseClient = createTestClient();
    streamableClient = createTestClient();

    // Start SSE server
    await startSseServer(
      sseClient.taskService,
      sseClient.commentService,
      sseClient.linkService,
      { port: SSE_PORT, host: 'localhost' }
    );

    // Start Streamable HTTP server
    startStreamableHttpServer(
      streamableClient.taskService,
      streamableClient.commentService,
      streamableClient.linkService,
      { port: STREAMABLE_PORT, host: 'localhost' }
    );

    // Wait for both servers to be ready
    await waitForServer(SSE_URL);
    await waitForServer(STREAMABLE_URL);
  }, 30000);

  afterAll(() => {
    sseClient.cleanup();
    streamableClient.cleanup();
  });

  describe('SSE Transport Performance', () => {
    it('measures throughput under sequential load', async () => {
      // Warm-up phase
      for (let i = 0; i < 5; i++) {
        await createTaskViaHttp(SSE_URL, `Warmup ${i}`);
      }

      // Measure throughput
      const startTime = performance.now();
      const numRequests = 50;
      const latencies: number[] = [];

      for (let i = 0; i < numRequests; i++) {
        const reqStart = performance.now();
        await createTaskViaHttp(SSE_URL, `SSE Task ${i}`);
        latencies.push(performance.now() - reqStart);
      }

      const totalTime = (performance.now() - startTime) / 1000; // Convert to seconds
      const requestsPerSecond = numRequests / totalTime;
      const percentiles = calculatePercentiles(latencies);

      // Store metrics
      const metric: Partial<PerformanceMetrics> = {
        transport: 'SSE',
        requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
        latencyP50: Math.round(percentiles.p50 * 100) / 100,
        latencyP95: Math.round(percentiles.p95 * 100) / 100,
        latencyP99: Math.round(percentiles.p99 * 100) / 100,
      };

      // Update or create SSE metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'SSE');
      if (existingIndex >= 0) {
        metrics[existingIndex] = { ...metrics[existingIndex], ...metric } as PerformanceMetrics;
      } else {
        metrics.push(metric as PerformanceMetrics);
      }

      expect(requestsPerSecond).toBeGreaterThan(0);
      expect(percentiles.p50).toBeGreaterThan(0);
    }, 60000);

    it('measures concurrent session handling', async () => {
      // Create multiple concurrent requests
      const numConcurrent = 10;
      const latencies: number[] = [];

      const startTime = performance.now();
      const promises = Array.from({ length: numConcurrent }, async (_, i) => {
        const reqStart = performance.now();
        await createTaskViaHttp(SSE_URL, `Concurrent SSE Task ${i}`);
        latencies.push(performance.now() - reqStart);
      });

      await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Update metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'SSE');
      if (existingIndex >= 0) {
        metrics[existingIndex].concurrentSessions = numConcurrent;
      }

      expect(latencies).toHaveLength(numConcurrent);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30s
    }, 60000);

    it('measures memory usage', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait for GC to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      const baselineMemory = measureMemory();

      // Perform operations
      for (let i = 0; i < 100; i++) {
        await createTaskViaHttp(SSE_URL, `Memory Test ${i}`);
      }

      // Wait briefly then measure
      await new Promise(resolve => setTimeout(resolve, 100));
      const memoryAfterOps = measureMemory();
      const rawMemoryDelta = memoryAfterOps - baselineMemory;
      const memoryUsed = Math.max(rawMemoryDelta, 0);

      // Update metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'SSE');
      if (existingIndex >= 0) {
        metrics[existingIndex].memoryUsageMB = memoryUsed;
      }

      expect(memoryUsed).toBeGreaterThanOrEqual(0);
    }, 60000);

    it('measures connection setup time', async () => {
      const setupTimes: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const response = await fetch(`${SSE_URL}/health`);
        await response.json();
        setupTimes.push(performance.now() - start);
      }

      const avgSetupTime = setupTimes.reduce((a, b) => a + b, 0) / setupTimes.length;

      // Update metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'SSE');
      if (existingIndex >= 0) {
        metrics[existingIndex].connectionSetupTime = Math.round(avgSetupTime * 100) / 100;
      }

      expect(avgSetupTime).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Streamable HTTP Transport Performance', () => {
    it('measures throughput under sequential load', async () => {
      // Warm-up phase
      for (let i = 0; i < 5; i++) {
        await createTaskViaHttp(STREAMABLE_URL, `Warmup ${i}`);
      }

      // Measure throughput
      const startTime = performance.now();
      const numRequests = 50;
      const latencies: number[] = [];

      for (let i = 0; i < numRequests; i++) {
        const reqStart = performance.now();
        await createTaskViaHttp(STREAMABLE_URL, `Streamable Task ${i}`);
        latencies.push(performance.now() - reqStart);
      }

      const totalTime = (performance.now() - startTime) / 1000;
      const requestsPerSecond = numRequests / totalTime;
      const percentiles = calculatePercentiles(latencies);

      // Store metrics
      const metric: Partial<PerformanceMetrics> = {
        transport: 'Streamable HTTP',
        requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
        latencyP50: Math.round(percentiles.p50 * 100) / 100,
        latencyP95: Math.round(percentiles.p95 * 100) / 100,
        latencyP99: Math.round(percentiles.p99 * 100) / 100,
      };

      // Update or create Streamable HTTP metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'Streamable HTTP');
      if (existingIndex >= 0) {
        metrics[existingIndex] = { ...metrics[existingIndex], ...metric } as PerformanceMetrics;
      } else {
        metrics.push(metric as PerformanceMetrics);
      }

      expect(requestsPerSecond).toBeGreaterThan(0);
      expect(percentiles.p50).toBeGreaterThan(0);
    }, 60000);

    it('measures concurrent session handling', async () => {
      // Create multiple concurrent requests
      const numConcurrent = 10;
      const latencies: number[] = [];

      const startTime = performance.now();
      const promises = Array.from({ length: numConcurrent }, async (_, i) => {
        const reqStart = performance.now();
        await createTaskViaHttp(STREAMABLE_URL, `Concurrent Streamable Task ${i}`);
        latencies.push(performance.now() - reqStart);
      });

      await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Update metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'Streamable HTTP');
      if (existingIndex >= 0) {
        metrics[existingIndex].concurrentSessions = numConcurrent;
      }

      expect(latencies).toHaveLength(numConcurrent);
      expect(totalTime).toBeLessThan(30000);
    }, 60000);

    it('measures memory usage', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait for GC to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      const baselineMemory = measureMemory();

      // Perform operations
      for (let i = 0; i < 100; i++) {
        await createTaskViaHttp(STREAMABLE_URL, `Memory Test ${i}`);
      }

      // Wait briefly then measure
      await new Promise(resolve => setTimeout(resolve, 100));
      const memoryAfterOps = measureMemory();
      const memoryUsed = Math.max(memoryAfterOps - baselineMemory, 0);

      // Update metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'Streamable HTTP');
      if (existingIndex >= 0) {
        metrics[existingIndex].memoryUsageMB = memoryUsed;
      }

      expect(memoryUsed).toBeGreaterThanOrEqual(0);
    }, 60000);

    it('measures connection setup time', async () => {
      const setupTimes: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const response = await fetch(`${STREAMABLE_URL}/health`);
        await response.json();
        setupTimes.push(performance.now() - start);
      }

      const avgSetupTime = setupTimes.reduce((a, b) => a + b, 0) / setupTimes.length;

      // Update metrics
      const existingIndex = metrics.findIndex(m => m.transport === 'Streamable HTTP');
      if (existingIndex >= 0) {
        metrics[existingIndex].connectionSetupTime = Math.round(avgSetupTime * 100) / 100;
      }

      expect(avgSetupTime).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Performance Comparison Report', () => {
    it('generates and displays comparison report', () => {
      expect(metrics).toHaveLength(2);

      const sseMetrics = metrics.find(m => m.transport === 'SSE');
      const streamableMetrics = metrics.find(m => m.transport === 'Streamable HTTP');

      expect(sseMetrics).toBeDefined();
      expect(streamableMetrics).toBeDefined();

      if (!sseMetrics || !streamableMetrics) {
        throw new Error('Metrics not collected');
      }

      // Calculate improvements
      const throughputImprovement = 
        ((streamableMetrics.requestsPerSecond - sseMetrics.requestsPerSecond) / 
        sseMetrics.requestsPerSecond) * 100;

      const p50Improvement = 
        ((sseMetrics.latencyP50 - streamableMetrics.latencyP50) / 
        sseMetrics.latencyP50) * 100;

      const p95Improvement = 
        ((sseMetrics.latencyP95 - streamableMetrics.latencyP95) / 
        sseMetrics.latencyP95) * 100;

      const p99Improvement = 
        ((sseMetrics.latencyP99 - streamableMetrics.latencyP99) / 
        sseMetrics.latencyP99) * 100;

      const memoryImprovement = 
        ((sseMetrics.memoryUsageMB - streamableMetrics.memoryUsageMB) / 
        sseMetrics.memoryUsageMB) * 100;

      const setupImprovement = 
        ((sseMetrics.connectionSetupTime - streamableMetrics.connectionSetupTime) / 
        sseMetrics.connectionSetupTime) * 100;

      // Generate report
      console.log('\n' + '='.repeat(80));
      console.log('TRANSPORT PERFORMANCE COMPARISON REPORT');
      console.log('='.repeat(80));
      console.log('\n## Metrics Summary\n');
      console.log('| Metric                | SSE Transport | Streamable HTTP | Improvement |');
      console.log('|-----------------------|---------------|-----------------|-------------|');
      console.log(`| Requests/sec          | ${sseMetrics.requestsPerSecond.toFixed(2).padStart(13)} | ${streamableMetrics.requestsPerSecond.toFixed(2).padStart(15)} | ${throughputImprovement > 0 ? '+' : ''}${throughputImprovement.toFixed(1)}% |`);
      console.log(`| P50 Latency (ms)      | ${sseMetrics.latencyP50.toFixed(2).padStart(13)} | ${streamableMetrics.latencyP50.toFixed(2).padStart(15)} | ${p50Improvement > 0 ? '+' : ''}${p50Improvement.toFixed(1)}% |`);
      console.log(`| P95 Latency (ms)      | ${sseMetrics.latencyP95.toFixed(2).padStart(13)} | ${streamableMetrics.latencyP95.toFixed(2).padStart(15)} | ${p95Improvement > 0 ? '+' : ''}${p95Improvement.toFixed(1)}% |`);
      console.log(`| P99 Latency (ms)      | ${sseMetrics.latencyP99.toFixed(2).padStart(13)} | ${streamableMetrics.latencyP99.toFixed(2).padStart(15)} | ${p99Improvement > 0 ? '+' : ''}${p99Improvement.toFixed(1)}% |`);
      console.log(`| Memory Usage (MB)     | ${sseMetrics.memoryUsageMB.toString().padStart(13)} | ${streamableMetrics.memoryUsageMB.toString().padStart(15)} | ${memoryImprovement > 0 ? '+' : ''}${memoryImprovement.toFixed(1)}% |`);
      console.log(`| Connection Setup (ms) | ${sseMetrics.connectionSetupTime.toFixed(2).padStart(13)} | ${streamableMetrics.connectionSetupTime.toFixed(2).padStart(15)} | ${setupImprovement > 0 ? '+' : ''}${setupImprovement.toFixed(1)}% |`);
      console.log(`| Concurrent Sessions   | ${sseMetrics.concurrentSessions.toString().padStart(13)} | ${streamableMetrics.concurrentSessions.toString().padStart(15)} | N/A         |`);
      console.log('\n' + '='.repeat(80));
      console.log('\n## Key Findings\n');
      
      if (throughputImprovement > 5) {
        console.log(`✓ Streamable HTTP shows ${throughputImprovement.toFixed(1)}% higher throughput`);
      } else if (throughputImprovement < -5) {
        console.log(`✗ SSE shows ${Math.abs(throughputImprovement).toFixed(1)}% higher throughput`);
      } else {
        console.log('≈ Throughput is comparable between transports');
      }

      if (p50Improvement > 5) {
        console.log(`✓ Streamable HTTP shows ${p50Improvement.toFixed(1)}% lower median latency`);
      } else if (p50Improvement < -5) {
        console.log(`✗ SSE shows ${Math.abs(p50Improvement).toFixed(1)}% lower median latency`);
      } else {
        console.log('≈ Median latency is comparable between transports');
      }

      if (memoryImprovement > 5) {
        console.log(`✓ Streamable HTTP uses ${memoryImprovement.toFixed(1)}% less memory`);
      } else if (memoryImprovement < -5) {
        console.log(`✗ SSE uses ${Math.abs(memoryImprovement).toFixed(1)}% less memory`);
      } else {
        console.log('≈ Memory usage is comparable between transports');
      }

      console.log('\n' + '='.repeat(80) + '\n');

      // Store metrics for documentation generation
      (global as any).performanceMetrics = {
        sse: sseMetrics,
        streamable: streamableMetrics,
        improvements: {
          throughput: throughputImprovement,
          p50: p50Improvement,
          p95: p95Improvement,
          p99: p99Improvement,
          memory: memoryImprovement,
          setup: setupImprovement,
        },
      };

      // Assertions to ensure metrics are reasonable
      expect(sseMetrics.requestsPerSecond).toBeGreaterThan(0);
      expect(streamableMetrics.requestsPerSecond).toBeGreaterThan(0);
      expect(sseMetrics.latencyP50).toBeGreaterThan(0);
      expect(streamableMetrics.latencyP50).toBeGreaterThan(0);
    }, 60000);
  });
});
