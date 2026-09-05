import { describe, it, expect, vi } from 'vitest';
import { projectTaskFields } from '../../../src/utils/fields.js';

describe('projectTaskFields', () => {
  const tasks = [
    {
      id: 1,
      title: 'First',
      status: 'idle',
      description: 'long text '.repeat(30),
      priority: 5,
      assigned_to: 'alice',
    },
    {
      id: 2,
      title: 'Second',
      status: 'working',
      description: 'more text '.repeat(30),
      priority: 8,
      assigned_to: null,
    },
  ];

  it('should project tasks onto the requested fields in order', () => {
    const projected = projectTaskFields(tasks, ['id', 'title', 'status']);
    expect(projected).toEqual([
      { id: 1, title: 'First', status: 'idle' },
      { id: 2, title: 'Second', status: 'working' },
    ]);
  });

  it('should skip fields that are not present', () => {
    const projected = projectTaskFields(tasks, ['id', 'nonexistent', 'priority']);
    expect(projected).toEqual([
      { id: 1, priority: 5 },
      { id: 2, priority: 8 },
    ]);
  });

  it('should preserve null values for requested fields', () => {
    const projected = projectTaskFields(tasks, ['id', 'assigned_to']);
    expect(projected[1]).toEqual({ id: 2, assigned_to: null });
  });

  it('should return tasks unchanged when no fields requested', () => {
    const projected = projectTaskFields(tasks, []);
    expect(projected).toEqual(tasks);
  });

  it('should pass through non-object entries unchanged', () => {
    const projected = projectTaskFields([tasks[0], 'string-entry', null], ['id']);
    expect(projected[0]).toEqual({ id: 1 });
    expect(projected[1]).toBe('string-entry');
    expect(projected[2]).toBeNull();
  });

  it('should actually shrink the payload', () => {
    const before = JSON.stringify(tasks).length;
    const after = JSON.stringify(projectTaskFields(tasks, ['id', 'title', 'status'])).length;
    expect(after).toBeLessThan(before / 3);
  });
});
