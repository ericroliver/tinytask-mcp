import { describe, it, expect, vi } from 'vitest';

// Mock the MCP SDK modules before importing anything that uses them
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamable.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

const { createCLI } = await import('../../../src/cli.js');

function getListCommand() {
  const cli = createCLI();
  const taskCmd = cli.commands.find((c) => c.name() === 'task');
  return taskCmd?.commands.find((c) => c.name() === 'list');
}

describe('Task List Response Slimming Options', () => {
  it('should have --full option to include descriptions', () => {
    const listCmd = getListCommand();
    expect(listCmd).toBeDefined();
    const options = listCmd!.options.map((o) => o.long);
    expect(options).toContain('--full');
  });

  it('should have --fields option for client-side projection', () => {
    const listCmd = getListCommand();
    const options = listCmd!.options.map((o) => o.long);
    expect(options).toContain('--fields');
  });

  it('should have --format option with format choices in help', () => {
    const listCmd = getListCommand();
    const options = listCmd!.options.map((o) => o.long);
    expect(options).toContain('--format');
    const formatOption = listCmd!.options.find((o) => o.long === '--format');
    expect(formatOption?.description).toContain('table');
    expect(formatOption?.description).toContain('compact');
  });

  it('should mention the default limit in --limit help text', () => {
    const listCmd = getListCommand();
    const limitOption = listCmd!.options.find((o) => o.long === '--limit');
    expect(limitOption?.description).toContain('default: 100');
  });

  it('should describe --full as keeping responses small by default', () => {
    const listCmd = getListCommand();
    const fullOption = listCmd!.options.find((o) => o.long === '--full');
    expect(fullOption?.description).toContain('omitted by default');
  });
});
