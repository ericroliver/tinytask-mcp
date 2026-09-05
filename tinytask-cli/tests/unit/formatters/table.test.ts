import { describe, it, expect } from 'vitest';
import { TableFormatter } from '../../../src/formatters/table.js';

describe('TableFormatter', () => {
  const tasks = [
    {
      id: 1,
      title: 'Test Task',
      status: 'idle',
      assigned_to: 'alice',
      priority: 5,
      blocked_by_task_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ];

  it('should format tasks as table', () => {
    const formatter = new TableFormatter({ color: false, verbose: false });
    const output = formatter.formatTasks(tasks);

    expect(output).toContain('Test Task');
    expect(output).toContain('idle');
    expect(output).toContain('alice');
  });

  it('should handle empty task list', () => {
    const formatter = new TableFormatter({ color: false, verbose: false });
    const output = formatter.formatTasks([]);

    expect(output).toContain('No tasks found');
  });

  it('should truncate long titles', () => {
    const longTask = {
      ...tasks[0],
      title: 'A'.repeat(100),
    };

    const formatter = new TableFormatter({ color: false, verbose: false });
    const output = formatter.formatTasks([longTask]);

    // cli-table3 truncates overflowing cells with '…'; formatter-level truncation uses '...'
    expect(output).toMatch(/…|\.\.\./);
    expect(output).not.toContain('A'.repeat(100));
  });

  it('should format single task with details', () => {
    const formatter = new TableFormatter({ color: false, verbose: false });
    const output = formatter.formatTask(tasks[0]);

    expect(output).toContain('Task #1');
    expect(output).toContain('Test Task');
    expect(output).toContain('alice');
  });

  it('should format queue data', () => {
    const formatter = new TableFormatter({ color: false, verbose: false });
    const queueData = {
      agent: 'test-agent',
      count: 1,
      tasks: tasks,
    };
    const output = formatter.formatQueue(queueData);

    expect(output).toContain('Queue for test-agent');
    expect(output).toContain('1 task');
  });

  it('should display blocked_by field when task is blocked', () => {
    const blockedTask = {
      ...tasks[0],
      blocked_by_task_id: 42,
      is_currently_blocked: true,
    };

    const formatter = new TableFormatter({ color: false, verbose: false });
    const output = formatter.formatTask(blockedTask);

    expect(output).toContain('Blocked by:');
    expect(output).toContain('#42');
  });

  it('should show blocked status in task list', () => {
    const blockedTask = {
      ...tasks[0],
      id: 2,
      title: 'Blocked Task',
      blocked_by_task_id: 1,
    };

    const formatter = new TableFormatter({ color: false, verbose: false });
    const output = formatter.formatTasks([tasks[0], blockedTask]);

    expect(output).toContain('Blocked Task');
    expect(output).toContain('#1');
  });
});
