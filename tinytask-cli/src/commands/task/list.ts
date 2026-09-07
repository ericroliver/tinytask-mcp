import { Command } from 'commander';
import chalk from 'chalk';
import { ensureConnected } from '../../client/connection.js';
import { createFormatter } from '../../formatters/index.js';
import { loadConfig } from '../../config/loader.js';
import { TaskFilters } from '../../client/mcp-client.js';
import { projectTaskFields } from '../../utils/fields.js';

const VALID_FORMATS = ['table', 'json', 'csv', 'compact'];

export function createTaskListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List tasks')
    .option('-a, --assigned-to <agent>', 'Filter by assignee')
    .option('-s, --status <status>', 'Filter by status (comma-separated, e.g., idle,working)')
    .option('--excludeStatus <status>', 'Exclude statuses (comma-separated, e.g., complete)')
    .option('-q, --queue <name>', 'Filter by queue')
    .option('--parent <id>', 'Filter by parent task ID', parseInt)
    .option('--exclude-subtasks', 'Exclude subtasks from results')
    .option('--include-archived', 'Include archived tasks')
    .option(
      '--full',
      'Include full task descriptions (descriptions are omitted by default to keep responses small)'
    )
    .option('--fields <fields>', 'Comma-separated task fields to include (e.g., id,title,status)')
    .option('--format <format>', 'Output format override (table, json, csv, compact)')
    .option('--limit <number>', 'Limit number of results (default: 100)', parseInt)
    .option('--offset <number>', 'Offset for pagination', parseInt)
    .action(async (options, command) => {
      try {
        if (options.format && !VALID_FORMATS.includes(options.format)) {
          console.error(
            chalk.red(
              `Error: Invalid format '${options.format}'. Valid formats: ${VALID_FORMATS.join(', ')}`
            )
          );
          process.exit(1);
        }

        const config = await loadConfig({
          url: command.optsWithGlobals().url,
          outputFormat: command.optsWithGlobals().json ? 'json' : options.format,
        });

        if (!config.url) {
          console.error(
            chalk.red('Error: No server URL configured. Use --url or configure a profile.')
          );
          process.exit(1);
        }

        const client = await ensureConnected(config.url);

        const filters: TaskFilters = {};
        if (options.assignedTo) filters.assigned_to = options.assignedTo;
        if (options.status) {
          const statuses = options.status
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
          filters.status = statuses.length === 1 ? statuses[0] : statuses;
        }
        if (options.excludeStatus) {
          filters.exclude_status = options.excludeStatus
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
        }
        if (options.queue) filters.queue_name = options.queue;
        if (options.parent !== undefined) filters.parent_task_id = options.parent;
        if (options.excludeSubtasks) filters.exclude_subtasks = true;
        if (options.includeArchived) filters.include_archived = true;
        if (options.full) filters.include_description = true;
        if (options.limit) filters.limit = options.limit;
        if (options.offset) filters.offset = options.offset;

        const result = await client.listTasks(filters);

        // Handle different response formats
        const response = result as Record<string, unknown>;
        let tasks = (response.tasks || result) as unknown[];

        // Client-side field projection (--fields id,title,...)
        if (options.fields) {
          const fields = String(options.fields)
            .split(',')
            .map((f: string) => f.trim())
            .filter(Boolean);
          tasks = projectTaskFields(tasks, fields);
        }

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(tasks));

        if (config.outputFormat === 'table' && response.count !== undefined) {
          console.log(chalk.gray(`\nTotal: ${response.count} task(s)`));
        }
      } catch (error) {
        console.error(
          chalk.red('Error listing tasks:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}
