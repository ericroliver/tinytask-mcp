import Table from 'cli-table3';
import chalk from 'chalk';
import { Formatter, FormatterOptions } from './types.js';

export class TableFormatter implements Formatter {
  constructor(private options: FormatterOptions) {}

  /**
   * Wrap text with indentation for continuation lines
   */
  private wrapWithIndent(text: string, maxWidth: number, indent: string): string {
    if (text.length <= maxWidth) {
      return text;
    }

    const lines: string[] = [];
    let currentLine = '';
    const words = text.split(' ');

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = indent + word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.join('\n');
  }

  formatTasks(tasks: unknown[]): string {
    if (tasks.length === 0) {
      return this.options.color ? chalk.yellow('No tasks found') : 'No tasks found';
    }

    const table = new Table({
      head: this.formatHeader([
        'ID',
        'Title',
        'Status',
        'Assigned',
        'Queue',
        'Parent',
        'Priority',
        'Blocked By',
      ]),
      style: {
        head: [],
        border: this.options.color ? ['gray'] : [],
      },
      colWidths: [6, 58, 12, 18, 17, 8, 10, 12],
      wordWrap: true,
    });

    // Organize tasks hierarchically
    const taskList = tasks as Record<string, unknown>[];
    const taskMap = new Map<number, Record<string, unknown>>();
    const parentTasks: Record<string, unknown>[] = [];
    const subtasksByParent = new Map<number, Record<string, unknown>[]>();

    // Build maps
    taskList.forEach((task) => {
      const taskId = task.id as number;
      taskMap.set(taskId, task);

      const parentId = task.parent_task_id as number | null;
      if (parentId) {
        if (!subtasksByParent.has(parentId)) {
          subtasksByParent.set(parentId, []);
        }
        subtasksByParent.get(parentId)!.push(task);
      } else {
        parentTasks.push(task);
      }
    });

    // Add rows in hierarchical order
    parentTasks.forEach((task) => {
      const t = task as Record<string, unknown>;
      table.push([
        this.formatId(t.id as number),
        String(t.title), // No truncation, let wordWrap handle it
        this.formatStatus(String(t.status)),
        this.formatAssignee(t.assigned_to as string | null),
        this.formatQueueName(t.queue_name as string | null),
        this.formatParent(t.parent_task_id as number | null),
        this.formatPriority(t.priority as number),
        this.formatBlockedBy(
          t.blocked_by_task_id as number | null,
          t.is_currently_blocked as boolean
        ),
      ]);

      // Add subtasks if any
      const subtasks = subtasksByParent.get(t.id as number);
      if (subtasks && subtasks.length > 0) {
        subtasks.forEach((subtask) => {
          const st = subtask as Record<string, unknown>;
          // Wrap subtask titles with indentation for continuation lines
          const wrappedTitle = this.wrapWithIndent('  ' + String(st.title), 56, '  ');
          table.push([
            this.formatId(st.id as number),
            wrappedTitle,
            this.formatStatus(String(st.status)),
            this.formatAssignee(st.assigned_to as string | null),
            this.formatQueueName(st.queue_name as string | null),
            this.formatParent(st.parent_task_id as number | null),
            this.formatPriority(st.priority as number),
            this.formatBlockedBy(
              st.blocked_by_task_id as number | null,
              st.is_currently_blocked as boolean
            ),
          ]);
        });
      }
    });

    return table.toString();
  }

  formatTask(task: Record<string, unknown>): string {
    const lines = [];

    lines.push(this.options.color ? chalk.cyan.bold(`Task #${task.id}`) : `Task #${task.id}`);
    lines.push('');
    lines.push(`${this.options.color ? chalk.gray('Title:') : 'Title:'}       ${task.title}`);
    lines.push(
      `${this.options.color ? chalk.gray('Status:') : 'Status:'}      ${this.formatStatus(String(task.status))}`
    );
    lines.push(
      `${this.options.color ? chalk.gray('Assigned:') : 'Assigned:'}    ${task.assigned_to || '-'}`
    );
    lines.push(`${this.options.color ? chalk.gray('Priority:') : 'Priority:'}    ${task.priority}`);

    if (task.description) {
      lines.push(
        `${this.options.color ? chalk.gray('Description:') : 'Description:'} ${task.description}`
      );
    }

    if (Array.isArray(task.tags) && task.tags.length > 0) {
      lines.push(
        `${this.options.color ? chalk.gray('Tags:') : 'Tags:'}        ${task.tags.join(', ')}`
      );
    }

    if (task.created_by) {
      lines.push(
        `${this.options.color ? chalk.gray('Created by:') : 'Created by:'}  ${task.created_by}`
      );
    }

    lines.push(
      `${this.options.color ? chalk.gray('Created:') : 'Created:'}     ${this.formatDate(String(task.created_at))}`
    );
    lines.push(
      `${this.options.color ? chalk.gray('Updated:') : 'Updated:'}     ${this.formatDate(String(task.updated_at))}`
    );

    if (task.blocked_by_task_id && task.is_currently_blocked) {
      lines.push(
        `${this.options.color ? chalk.gray('Blocked by:') : 'Blocked by:'} ${this.formatBlockedBy(task.blocked_by_task_id as number, task.is_currently_blocked as boolean)}`
      );
    }

    if (Array.isArray(task.comments) && task.comments.length > 0) {
      lines.push('');
      lines.push(
        this.options.color
          ? chalk.gray('─────────────────────────────────────────')
          : '─────────────────────────────────────────'
      );
      lines.push(this.options.color ? chalk.cyan.bold('Comments:') : 'Comments:');
      task.comments.forEach((comment: unknown, index: number) => {
        const c = comment as Record<string, unknown>;
        const date = this.formatDate(String(c.created_at));
        if (index > 0) {
          lines.push(this.options.color ? chalk.gray('  ─────────') : '  ─────────');
        }
        lines.push(
          this.options.color
            ? `  ${chalk.bold(`[${c.id}]`)} ${c.created_by || 'Unknown'} ${chalk.gray(`(${date})`)}: ${c.content}`
            : `  [${c.id}] ${c.created_by || 'Unknown'} (${date}): ${c.content}`
        );
      });
    }

    if (Array.isArray(task.links) && task.links.length > 0) {
      lines.push('');
      lines.push(this.options.color ? chalk.cyan.bold('Links:') : 'Links:');
      task.links.forEach((link: unknown) => {
        const l = link as Record<string, unknown>;
        lines.push(`  [${l.id}] ${l.url}`);
        if (l.description) {
          lines.push(
            `       ${this.options.color ? chalk.gray(String(l.description)) : l.description}`
          );
        }
      });
    }

    return lines.join('\n');
  }

  formatQueue(queueData: Record<string, unknown>): string {
    const { agent, count, tasks } = queueData;

    const lines = [];
    lines.push(this.options.color ? chalk.cyan.bold(`Queue for ${agent}`) : `Queue for ${agent}`);
    lines.push(
      this.options.color
        ? chalk.gray(`${count} task${count !== 1 ? 's' : ''}`)
        : `${count} task${count !== 1 ? 's' : ''}`
    );
    lines.push('');

    if (Array.isArray(tasks) && tasks.length === 0) {
      const msg = 'No tasks in queue';
      return lines.join('\n') + (this.options.color ? chalk.yellow(msg) : msg);
    }

    lines.push(this.formatTasks(tasks as unknown[]));

    return lines.join('\n');
  }

  formatQueueList(queueData: Record<string, unknown>): string {
    const { count, queues } = queueData;
    const queueCount =
      typeof count === 'number' ? count : Array.isArray(queues) ? queues.length : 0;

    const lines = [];
    lines.push(this.options.color ? chalk.cyan.bold('Queues') : 'Queues');
    lines.push(
      this.options.color
        ? chalk.gray(`${queueCount} queue${queueCount !== 1 ? 's' : ''}`)
        : `${queueCount} queue${queueCount !== 1 ? 's' : ''}`
    );
    lines.push('');

    if (!Array.isArray(queues) || queues.length === 0) {
      const msg = 'No queues found';
      return lines.join('\n') + '\n' + (this.options.color ? chalk.yellow(msg) : msg);
    }

    const table = new Table({
      head: this.formatHeader(['Queue']),
      style: {
        head: [],
        border: this.options.color ? ['gray'] : [],
      },
      wordWrap: true,
    });

    queues.forEach((queue) => {
      table.push([String(queue)]);
    });

    lines.push(table.toString());
    return lines.join('\n');
  }

  formatComments(commentData: Record<string, unknown>): string {
    const { task_id, count, comments } = commentData;

    const lines = [];
    lines.push(
      this.options.color
        ? chalk.cyan.bold(`Comments for Task #${task_id}`)
        : `Comments for Task #${task_id}`
    );
    lines.push(
      this.options.color
        ? chalk.gray(`${count} comment${count !== 1 ? 's' : ''}`)
        : `${count} comment${count !== 1 ? 's' : ''}`
    );
    lines.push('');

    if (!Array.isArray(comments) || comments.length === 0) {
      const msg = 'No comments found';
      lines.push(this.options.color ? chalk.yellow(msg) : msg);
      return lines.join('\n');
    }

    const table = new Table({
      head: this.formatHeader(['ID', 'Author', 'Content', 'Created']),
      style: {
        head: [],
        border: this.options.color ? ['gray'] : [],
      },
      colWidths: [6, 15, 40, 20],
      wordWrap: true,
    });

    comments.forEach((comment) => {
      const c = comment as Record<string, unknown>;
      table.push([
        this.formatId(c.id as number),
        c.created_by || (this.options.color ? chalk.gray('Unknown') : 'Unknown'),
        this.truncate(String(c.content), 38),
        this.formatDate(String(c.created_at)),
      ]);
    });

    lines.push(table.toString());

    return lines.join('\n');
  }

  formatLinks(linkData: Record<string, unknown>): string {
    const { task_id, count, links } = linkData;

    const lines = [];
    lines.push(
      this.options.color
        ? chalk.cyan.bold(`Links for Task #${task_id}`)
        : `Links for Task #${task_id}`
    );
    lines.push(
      this.options.color
        ? chalk.gray(`${count} link${count !== 1 ? 's' : ''}`)
        : `${count} link${count !== 1 ? 's' : ''}`
    );
    lines.push('');

    if (!Array.isArray(links) || links.length === 0) {
      const msg = 'No links found';
      lines.push(this.options.color ? chalk.yellow(msg) : msg);
      return lines.join('\n');
    }

    const table = new Table({
      head: this.formatHeader(['ID', 'URL', 'Description', 'Created']),
      style: {
        head: [],
        border: this.options.color ? ['gray'] : [],
      },
      colWidths: [6, 40, 30, 20],
      wordWrap: true,
    });

    links.forEach((link) => {
      const l = link as Record<string, unknown>;
      table.push([
        this.formatId(l.id as number),
        this.truncate(String(l.url), 38),
        l.description
          ? this.truncate(String(l.description), 28)
          : this.options.color
            ? chalk.gray('-')
            : '-',
        this.formatDate(String(l.created_at)),
      ]);
    });

    lines.push(table.toString());

    return lines.join('\n');
  }

  private formatHeader(headers: string[]): string[] {
    if (!this.options.color) {
      return headers;
    }
    return headers.map((h) => chalk.cyan(h));
  }

  private formatId(id: number): string {
    return this.options.color ? chalk.bold(id.toString()) : id.toString();
  }

  private formatStatus(status: string): string {
    if (!this.options.color) {
      return status;
    }

    switch (status) {
      case 'idle':
        return chalk.yellow(status);
      case 'working':
        return chalk.blue(status);
      case 'complete':
        return chalk.green(status);
      default:
        return status;
    }
  }

  private formatAssignee(assignee: string | null): string {
    if (!assignee) {
      return this.options.color ? chalk.gray('-') : '-';
    }
    return assignee;
  }

  private formatPriority(priority: number): string {
    if (!this.options.color) {
      return priority.toString();
    }

    if (priority >= 8) {
      return chalk.red(priority.toString());
    } else if (priority >= 5) {
      return chalk.yellow(priority.toString());
    } else {
      return chalk.gray(priority.toString());
    }
  }

  private formatQueueName(queueName: string | null): string {
    if (!queueName) {
      return this.options.color ? chalk.gray('-') : '-';
    }
    return this.options.color ? chalk.blue(queueName) : queueName;
  }

  private formatParent(parentId: number | null): string {
    if (!parentId) {
      return this.options.color ? chalk.gray('-') : '-';
    }
    return this.options.color ? chalk.magenta(`#${parentId}`) : `#${parentId}`;
  }

  private formatBlockedBy(blockedById: number | null, isCurrentlyBlocked?: boolean): string {
    if (!blockedById || isCurrentlyBlocked === false) {
      return this.options.color ? chalk.gray('-') : '-';
    }
    return this.options.color ? chalk.red(`#${blockedById}`) : `#${blockedById}`;
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) {
      return str;
    }
    return str.substring(0, maxLen - 3) + '...';
  }

  formatComment(comment: Record<string, unknown>): string {
    const lines = [];
    const id = comment.id as number;
    const taskId = comment.task_id as number;
    const author = comment.created_by || 'Unknown';
    const content = String(comment.content);
    const createdAt = this.formatDate(String(comment.created_at));
    const updatedAt = this.formatDate(String(comment.updated_at));

    lines.push(this.options.color ? chalk.cyan.bold(`Comment #${id}`) : `Comment #${id}`);
    lines.push('');
    lines.push(`${this.options.color ? chalk.gray('Task:') : 'Task:'}        #${taskId}`);
    lines.push(`${this.options.color ? chalk.gray('Author:') : 'Author:'}     ${author}`);
    lines.push(`${this.options.color ? chalk.gray('Created:') : 'Created:'}    ${createdAt}`);
    if (updatedAt !== createdAt) {
      lines.push(`${this.options.color ? chalk.gray('Updated:') : 'Updated:'}    ${updatedAt}`);
    }
    lines.push('');
    lines.push(
      this.options.color
        ? chalk.gray('─────────────────────────────────────────')
        : '─────────────────────────────────────────'
    );
    lines.push('');
    lines.push(content);

    return lines.join('\n');
  }

  format(data: unknown): string {
    // Auto-detect data type and format appropriately
    if (Array.isArray(data)) {
      return this.formatTasks(data);
    } else if (typeof data === 'object' && data !== null && 'agent' in data && 'tasks' in data) {
      return this.formatQueue(data as Record<string, unknown>);
    } else if (typeof data === 'object' && data !== null && 'queues' in data) {
      return this.formatQueueList(data as Record<string, unknown>);
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'task_id' in data &&
      'comments' in data
    ) {
      return this.formatComments(data as Record<string, unknown>);
    } else if (typeof data === 'object' && data !== null && 'task_id' in data && 'links' in data) {
      return this.formatLinks(data as Record<string, unknown>);
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'content' in data &&
      'task_id' in data &&
      !('title' in data)
    ) {
      // Single comment object
      return this.formatComment(data as Record<string, unknown>);
    } else {
      return this.formatTask(data as Record<string, unknown>);
    }
  }
}
