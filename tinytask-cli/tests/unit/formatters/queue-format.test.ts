import { describe, it, expect } from 'vitest';
import { TableFormatter } from '../../../src/formatters/table.js';
import { CompactFormatter } from '../../../src/formatters/compact.js';
import { CSVFormatter } from '../../../src/formatters/csv.js';
import { FormatterOptions } from '../../../src/formatters/types.js';

const opts: FormatterOptions = { color: false, verbose: false };

// Payload shape returned by the list_queues MCP tool (via `tinytask queue list`)
const queueListPayload = {
  count: 2,
  queues: ['backlog', 'ready-for-development'],
};

// Payload shape returned by get_my_queue (via `tinytask queue view`)
const queueViewPayload = {
  agent: 'tko-sword',
  count: 2,
  tasks: [
    { id: 1, title: 'First task', status: 'idle', priority: 5, created_at: '2026-09-05T00:00:00Z' },
    {
      id: 2,
      title: 'Second task',
      status: 'working',
      priority: 8,
      assigned_to: 'tko-sword',
      created_at: '2026-09-05T00:00:00Z',
    },
  ],
};

describe('TableFormatter queue payloads', () => {
  it('renders list_queues payload as a queue table (no formatTask fallthrough)', () => {
    const out = new TableFormatter(opts).format(queueListPayload);
    expect(out).toContain('Queues');
    expect(out).toContain('backlog');
    expect(out).toContain('ready-for-development');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('Invalid Date');
  });

  it('renders empty list_queues payload with a friendly message', () => {
    const out = new TableFormatter(opts).format({ count: 0, queues: [] });
    expect(out).toContain('No queues found');
    expect(out).not.toContain('undefined');
  });

  it('handles missing count by deriving it from queues array', () => {
    const out = new TableFormatter(opts).format({ queues: ['triage'] });
    expect(out).toContain('1 queue');
    expect(out).toContain('triage');
  });

  it('renders queue view payload with agent header and tasks', () => {
    const out = new TableFormatter(opts).format(queueViewPayload);
    expect(out).toContain('Queue for tko-sword');
    expect(out).toContain('First task');
    expect(out).toContain('Second task');
  });
});

describe('CompactFormatter queue payloads', () => {
  it('renders list_queues payload as a single compact line', () => {
    const out = new CompactFormatter(opts).format(queueListPayload);
    const lines = out.split('\n');
    expect(lines).toHaveLength(1);
    expect(out).toContain('Queues (2)');
    expect(out).toContain('backlog');
    expect(out).toContain('ready-for-development');
  });

  it('renders empty list_queues payload with a friendly message', () => {
    const out = new CompactFormatter(opts).format({ count: 0, queues: [] });
    expect(out).toContain('No queues');
  });

  it('renders queue view payload with one line per task', () => {
    const out = new CompactFormatter(opts).format(queueViewPayload);
    const lines = out.split('\n');
    expect(lines[0]).toContain('Queue for tko-sword (2 tasks)');
    expect(lines).toHaveLength(3); // header + 2 tasks
    expect(out).toContain('[1] First task');
    expect(out).toContain('[2] Second task');
  });

  it('renders empty queue view payload with a friendly message', () => {
    const out = new CompactFormatter(opts).format({ agent: 'tko-sword', count: 0, tasks: [] });
    expect(out).toContain('Queue for tko-sword');
    expect(out).toContain('No tasks in queue');
  });
});

describe('CSVFormatter queue payloads', () => {
  it('renders list_queues payload as a single name column', () => {
    const out = new CSVFormatter(opts).format(queueListPayload);
    const lines = out.split('\n');
    expect(lines[0]).toBe('name');
    expect(lines[1]).toBe('backlog');
    expect(lines[2]).toBe('ready-for-development');
  });

  it('renders queue view payload as task rows', () => {
    const out = new CSVFormatter(opts).format(queueViewPayload);
    const lines = out.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[1]).toContain('First task');
    expect(lines[2]).toContain('Second task');
  });
});
