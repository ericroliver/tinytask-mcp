/**
 * Project each task object onto a subset of fields, preserving the requested
 * field order. Non-object entries pass through unchanged.
 */
export function projectTaskFields(tasks: unknown[], fields: string[]): unknown[] {
  if (fields.length === 0) {
    return tasks;
  }
  return tasks.map((task) => {
    if (typeof task !== 'object' || task === null) {
      return task;
    }
    const source = task as Record<string, unknown>;
    const projected: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in source) {
        projected[field] = source[field];
      }
    }
    return projected;
  });
}
