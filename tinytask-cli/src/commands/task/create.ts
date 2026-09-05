import { Command } from 'commander';
import chalk from 'chalk';
import { ensureConnected } from '../../client/connection.js';
import { createFormatter } from '../../formatters/index.js';
import { loadConfig } from '../../config/loader.js';
import { resolveContent } from '../../utils/stdin.js';

export function createTaskCreateCommand(program: Command): void {
  program
    .command('create <title>')
    .description('Create a new task')
    .option('-d, --description <text>', 'Task description')
    .option('--stdin', 'Read description from stdin instead of -d option')
    .option('-a, --assigned-to <agent>', 'Assign to agent')
    .option('-c, --created-by <agent>', 'Created by agent')
    .option('-p, --priority <number>', 'Priority (default: 0)', parseInt)
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Create as subtask under parent task ID', parseInt)
    .option('-q, --queue <name>', 'Assign to queue')
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
        '  tinytask task create "Implement pagination" -d "Add limit/offset" -a dev',
        '',
        '  # Long/multi-line description via stdin (avoids shell issues with backticks, $, etc.)',
        '  tinytask task create "Fix shell injection" --stdin -a dev -q ready-for-development <<\'EOF\'',
        '  ## Problem',
        '  Backticks in `bash -c` cause command substitution inside double quotes.',
        '  ## Solution',
        '  Add `--stdin` flag to all content-accepting CLI commands.',
        '  EOF',
        '',
        '  # Always use --stdin with a quoted heredoc for content containing',
        '  # backticks, $, or other shell metacharacters to prevent command substitution.',
      ].join('\n')
    )
    .action(async (title: string, options, command) => {
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

        // Resolve description: use stdin if --stdin flag is set, otherwise use -d option
        const description = await resolveContent(options.stdin, options.description);

        // Parse tags if provided
        const tags = options.tags
          ? options.tags.split(',').map((t: string) => t.trim())
          : undefined;

        // Create task
        const createdBy = options.createdBy || config.agent;
        if (!createdBy) {
          console.error(
            chalk.red('Error: Agent identity is required. Use --created-by <agent>')
          );
          console.error(chalk.gray('Or set the TKO_AGENT environment variable'));
          process.exit(1);
        }

        const task = await client.createTask({
          title,
          description,
          assigned_to: options.assignedTo || undefined,
          created_by: createdBy,
          priority: options.priority,
          tags,
          parent_task_id: options.parent,
          queue_name: options.queue,
          auto_promote: options.autoPromote === false ? false : undefined,
        });

        // Format output
        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(task));

        if (config.outputFormat === 'table') {
          console.log(chalk.green(`✓ Task #${(task as Record<string, unknown>).id} created`));
        }
      } catch (error) {
        console.error(
          chalk.red('Error creating task:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}
