/**
 * Regression tests for the non-interactive delete confirmation contract (#900).
 *
 * The Windows dev pod reported `task delete` prompting for y/N even though
 * `queue clear` accepts `--yes`. At HEAD both commands expose `-y/--yes`
 * ("Skip confirmation"); these tests pin that CLI surface so a refactor
 * cannot silently drop the flag again.
 *
 * Note: we deliberately do NOT call .parse() on the command — that would
 * execute the action handler, which connects/exits and would kill the
 * test worker. Option-surface assertions are the right scope here;
 * behavioral `--yes` skipping is verified live against a built binary.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the MCP SDK modules before importing anything that uses them
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamable.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

const { createCLI } = await import('../../../src/cli.js');

describe('Non-interactive delete confirmation (#900)', () => {
  it('task delete exposes -y/--yes with a skip-confirmation description', () => {
    const cli = createCLI();
    const taskCmd = cli.commands.find((c) => c.name() === 'task');
    const deleteCmd = taskCmd?.commands.find((c) => c.name() === 'delete');
    expect(deleteCmd).toBeDefined();

    const yes = deleteCmd?.options.find((o) => o.long === '--yes');
    expect(yes).toBeDefined();
    expect(yes?.short).toBe('-y');
    expect(yes?.isBoolean()).toBe(true);
    expect(yes?.description).toMatch(/skip confirmation/i);
  });

  it('queue clear exposes -y/--yes with a skip-confirmation description', () => {
    const cli = createCLI();
    const queueCmd = cli.commands.find((c) => c.name() === 'queue');
    const clearCmd = queueCmd?.commands.find((c) => c.name() === 'clear');
    expect(clearCmd).toBeDefined();

    const yes = clearCmd?.options.find((o) => o.long === '--yes');
    expect(yes).toBeDefined();
    expect(yes?.short).toBe('-y');
    expect(yes?.isBoolean()).toBe(true);
    expect(yes?.description).toMatch(/skip confirmation/i);
  });
});
