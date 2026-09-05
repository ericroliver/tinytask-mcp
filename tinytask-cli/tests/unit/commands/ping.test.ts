import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the MCP SDK modules before importing anything that uses them
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamable.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

const ensureConnected = vi.fn();

vi.mock('../../../src/client/connection.js', () => ({
  ensureConnected: (...args: unknown[]) => ensureConnected(...args),
}));

vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: vi.fn(async () => ({
    url: 'http://localhost:9999/mcp',
    agent: 'tester',
    outputFormat: 'table',
    colorOutput: false,
    timeout: 5000,
  })),
}));

const { createCLI } = await import('../../../src/cli.js');

describe('ping command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    logs = [];
    errors = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => logs.push(String(m)));
    errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => errors.push(args.map(String).join(' ')));
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('performs a real round-trip and reports server URL with latency', async () => {
    ensureConnected.mockResolvedValue({
      listQueues: vi.fn().mockResolvedValue({ count: 0, queues: [] }),
    });

    const cli = createCLI();
    await cli.parseAsync(['ping'], { from: 'user' });

    expect(ensureConnected).toHaveBeenCalledWith('http://localhost:9999/mcp');
    const output = logs.join('\n');
    expect(output).toContain('reachable');
    expect(output).toContain('http://localhost:9999/mcp');
    expect(output).toMatch(/\(\d+ms\)/);
  });

  it('exits non-zero with a clear error when the server is unreachable', async () => {
    ensureConnected.mockRejectedValue(new Error('fetch failed'));

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code}`);
      }) as never);

    const cli = createCLI();
    await expect(cli.parseAsync(['ping'], { from: 'user' })).rejects.toThrow('process.exit:1');

    exitSpy.mockRestore();
    expect(errors.join('\n')).toContain('unreachable');
    expect(errors.join('\n')).toContain('fetch failed');
  });

  it('exits non-zero when the round-trip call fails after connecting', async () => {
    ensureConnected.mockResolvedValue({
      listQueues: vi.fn().mockRejectedValue(new Error('call failed')),
    });

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code}`);
      }) as never);

    const cli = createCLI();
    await expect(cli.parseAsync(['ping'], { from: 'user' })).rejects.toThrow('process.exit:1');

    exitSpy.mockRestore();
    expect(errors.join('\n')).toContain('call failed');
  });
});
