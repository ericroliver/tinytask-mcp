import { Command } from 'commander';
import chalk from 'chalk';
import { ensureConnected } from '../../client/connection.js';
import { createFormatter } from '../../formatters/index.js';
import { loadConfig } from '../../config/loader.js';
import { UpdateTaskParams } from '../../client/mcp-client.js';
import { resolveContent } from '../../utils/stdin.js';

export function createTaskUpdateCommand(program: Command): void {
  program
    .command('update <id>')
    .description('Update a task')
    .option('-t, --title <text>', 'Update title')
    .option('-d, --description <text>', 'Update description')
    .option('--stdin', 'Read description from stdin instead of -d option')
    .option('-s, --status <status>', 'Update status (idle, working, complete)')
    .option('-a, --assigned-to <agent>', 'Update assignee')
    .option('-p, --priority <number>', 'Update priority', parseInt)
    .option('--tags <tags>', 'Update tags (comma-separated)')
    .option('--parent <id>', 'Change parent task ID (use "null" to make top-level)')
    .option('-q, --queue <name>', 'Change queue assignment')
    .option(
      '--no-auto-promote',
      "Disable auto-updating this task's status from its children (default: auto-promote on)"
    )
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  # Short description via -d option',
        '  tinytask task update 5 -d "Updated description" --status working',
        '',
        '  # Long/multi-line description via stdin (avoids shell issues with backticks, $, etc.)',
        "  tinytask task update 5 --stdin <<'EOF'",
        '  ## Updated Description',
        '  Fixed `hostname` field — now uses proper config.',
        '  EOF',
        '',
        '  # Always use --stdin with a quoted heredoc for content containing',
        '  # backticks, $, or other shell metacharacters to prevent command substitution.',
      ].join('\n')
    )
    .action(async (id: string, options, command) => {
      try {
        const config = await loadConfig({
          url: command.optsWithGlobals().url,
          outputFormat: command.optsWithGlobals().json ? 'json' : undefined,
        });

        if (!config.url) {
          console.error(
            chalk.red('Error: No server URL configured. Use --url or configure a profile.')
          );
          process.exit(1);
        }

        const client = await ensureConnected(config.url);

        // Build update params
        const updates: UpdateTaskParams = { id: parseInt(id) };

        // Resolve description: use stdin if --stdin flag is set, otherwise use -d option
        if (options.stdin || options.description !== undefined) {
          const description = await resolveContent(options.stdin, options.description);
          if (description !== undefined) updates.description = description;
        }

        if (options.title) updates.title = options.title;
        if (options.status) updates.status = options.status;
        if (options.assignedTo) updates.assigned_to = options.assignedTo;
        if (options.priority !== undefined) updates.priority = options.priority;
        if (options.tags) updates.tags = options.tags.split(',').map((t: string) => t.trim());

        // Handle parent task ID (including "null" to remove parent)
        if (options.parent !== undefined) {
          if (options.parent === 'null') {
            updates.parent_task_id = undefined;
          } else {
            const parentId = parseInt(options.parent);
            if (isNaN(parentId)) {
              console.error(chalk.red('Error: Parent ID must be a number or "null"'));
              process.exit(1);
            }
            updates.parent_task_id = parentId;
          }
        }

        if (options.queue) updates.queue_name = options.queue;

        if (options.autoPromote === false) {
          updates.auto_promote = false;
        }

        const task = await client.updateTask(updates);

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(task));

        if (config.outputFormat === 'table') {
          console.log(chalk.green(`✓ Task #${id} updated`));
        }
      } catch (error) {
        console.error(
          chalk.red('Error updating task:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}
