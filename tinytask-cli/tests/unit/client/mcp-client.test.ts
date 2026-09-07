import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the MCP SDK before importing the client
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
    close: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn().mockResolvedValue({
      isError: false,
      content: [{ text: '{"result":"success"}' }],
    }),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamable.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

const { TinyTaskClient } = await import('../../../src/client/mcp-client.js');

describe('TinyTaskClient', () => {
  let client: typeof TinyTaskClient.prototype;
  const testUrl = 'http://localhost:3000/mcp';

  beforeEach(() => {
    client = new TinyTaskClient(testUrl);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should create client instance', () => {
    expect(client).toBeDefined();
  });

  it('should throw error when calling methods before connect', async () => {
    await expect(client.listTasks()).rejects.toThrow('Client not connected');
  });

  it('should throw error when calling getTask before connect', async () => {
    await expect(client.getTask(1)).rejects.toThrow('Client not connected');
  });

  it('should throw error when calling createTask before connect', async () => {
    await expect(client.createTask({ title: 'Test' })).rejects.toThrow('Client not connected');
  });

  it('should allow multiple disconnect calls', async () => {
    await client.disconnect();
    await expect(client.disconnect()).resolves.not.toThrow();
  });

  it('should have proper structure', () => {
    expect(client).toBeDefined();
    expect(typeof client.connect).toBe('function');
    expect(typeof client.disconnect).toBe('function');
    expect(typeof client.createTask).toBe('function');
    expect(typeof client.getTask).toBe('function');
    expect(typeof client.listTasks).toBe('function');
  });

  describe('signupForTask tolerant parsing (#899)', () => {
    let tolerantClient: InstanceType<typeof TinyTaskClient>;

    beforeEach(async () => {
      const sdkModule = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(sdkModule.Client).mockImplementation(
        () =>
          ({
            connect: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            callTool: vi.fn(),
          }) as unknown as InstanceType<(typeof sdkModule)['Client']>
      );
      tolerantClient = new TinyTaskClient(testUrl);
      await tolerantClient.connect();
    });

    afterEach(async () => {
      await tolerantClient.disconnect();
    });

    function getCallTool(c: InstanceType<typeof TinyTaskClient>): ReturnType<typeof vi.fn> {
      return (c as unknown as { client: { callTool: ReturnType<typeof vi.fn> } }).client.callTool;
    }

    it('returns the task object for pure JSON responses (server >= 2.2.2)', async () => {
      const task = { id: 5, title: 'T', status: 'working', assigned_to: 'agent-1' };
      getCallTool(tolerantClient).mockResolvedValueOnce({
        isError: false,
        content: [{ text: JSON.stringify(task) }],
      });
      await expect(tolerantClient.signupForTask('agent-1')).resolves.toEqual(task);
    });

    it('returns null for JSON null responses (empty queue, server >= 2.2.2)', async () => {
      getCallTool(tolerantClient).mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'null' }],
      });
      await expect(tolerantClient.signupForTask('agent-1')).resolves.toBeNull();
    });

    it('returns null for legacy "No idle tasks" text (server < 2.2.2)', async () => {
      getCallTool(tolerantClient).mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'No idle tasks available in queue for agent: agent-1' }],
      });
      await expect(tolerantClient.signupForTask('agent-1')).resolves.toBeNull();
    });

    it('extracts task JSON from legacy preamble responses (server < 2.2.2)', async () => {
      const task = { id: 7, title: 'Legacy', status: 'working' };
      getCallTool(tolerantClient).mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: `Task #7 claimed and set to working status\n\n${JSON.stringify(task, null, 2)}`,
          },
        ],
      });
      await expect(tolerantClient.signupForTask('agent-1')).resolves.toEqual(task);
    });

    it('unwraps a { task, message } envelope defensively', async () => {
      getCallTool(tolerantClient).mockResolvedValueOnce({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              task: null,
              message: 'No idle tasks available in queue for agent: agent-1',
            }),
          },
        ],
      });
      await expect(tolerantClient.signupForTask('agent-1')).resolves.toBeNull();
    });

    it('throws a descriptive error for unparseable responses', async () => {
      getCallTool(tolerantClient).mockResolvedValueOnce({
        isError: false,
        content: [{ text: 'utter garbage' }],
      });
      await expect(tolerantClient.signupForTask('agent-1')).rejects.toThrow(
        'Failed to parse server response'
      );
    });
  });

  describe('getTaskHistory unknown-tool guidance (#898)', () => {
    let guidedClient: InstanceType<typeof TinyTaskClient>;

    beforeEach(async () => {
      const sdkModule = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(sdkModule.Client).mockImplementation(
        () =>
          ({
            connect: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            callTool: vi.fn(),
          }) as unknown as InstanceType<(typeof sdkModule)['Client']>
      );
      guidedClient = new TinyTaskClient(testUrl);
      await guidedClient.connect();
    });

    afterEach(async () => {
      await guidedClient.disconnect();
    });

    function getCallTool(c: InstanceType<typeof TinyTaskClient>): ReturnType<typeof vi.fn> {
      return (c as unknown as { client: { callTool: ReturnType<typeof vi.fn> } }).client.callTool;
    }

    it('translates "Unknown tool" result errors into actionable guidance', async () => {
      getCallTool(guidedClient).mockResolvedValueOnce({
        isError: true,
        content: [{ text: 'Unknown tool: get_task_history' }],
      });
      await expect(guidedClient.getTaskHistory(1)).rejects.toThrow(
        /requires tinytask-mcp >= 2\.2\.0/
      );
    });

    it('translates thrown SDK unknown-tool errors too', async () => {
      getCallTool(guidedClient).mockRejectedValueOnce(
        new Error('Unknown tool: get_task_history')
      );
      await expect(guidedClient.getTaskHistory(1)).rejects.toThrow(
        /Rebuild\/redeploy the tinytask-mcp server image/
      );
    });

    it('passes through unrelated errors untouched', async () => {
      getCallTool(guidedClient).mockResolvedValueOnce({
        isError: true,
        content: [{ text: 'Task not found: 1' }],
      });
      await expect(guidedClient.getTaskHistory(1)).rejects.toThrow('Task not found: 1');
    });
  });
});
