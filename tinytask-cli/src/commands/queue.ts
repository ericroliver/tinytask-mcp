import { Command } from 'commander';
import chalk from 'chalk';
import { ensureConnected } from '../client/connection.js';
import { createFormatter } from '../formatters/index.js';
import { loadConfig } from '../config/loader.js';

export function createQueueCommands(program: Command): void {
  const queue = program.command('queue').alias('q').description('Manage task queues');

  // View agent queue (backwards compatibility)
  queue
    .command('view [agent]')
    .description('View task queue for an agent')
    .option('-s, --status <status>', 'Filter by status')
    .option('--mine', 'View my queue (uses default agent from config)')
    .action(async (agent: string | undefined, options, command) => {
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

        // Determine agent name
        let agentName = agent;
        if (options.mine || !agentName) {
          agentName = config.agent;
          if (!agentName) {
            console.error(chalk.red('Error: No agent specified and no agent configured'));
            console.error(chalk.gray('Use: tinytask queue view <agent-name>'));
            console.error(chalk.gray('Or set the TKO_AGENT environment variable'));
            process.exit(1);
          }
        }

        const client = await ensureConnected(config.url);
        const queueData = await client.getMyQueue(agentName);

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(queueData));
      } catch (error) {
        console.error(
          chalk.red('Error getting queue:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // List all queues
  queue
    .command('list')
    .alias('ls')
    .description('List all queue names')
    .action(async (options, command) => {
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
        const queues = await client.listQueues();

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(queues));
      } catch (error) {
        console.error(
          chalk.red('Error listing queues:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // Queue statistics
  queue
    .command('stats <queue-name>')
    .description('Get statistics for a queue')
    .action(async (queueName: string, options, command) => {
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
        const stats = await client.getQueueStats(queueName);

        // Use stats formatter for better output
        const formatter = createFormatter(config.outputFormat === 'json' ? 'json' : 'stats', {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(stats));
      } catch (error) {
        console.error(
          chalk.red('Error getting queue stats:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // View tasks in queue
  queue
    .command('tasks <queue-name>')
    .description('View all tasks in a queue')
    .option('-s, --status <status>', 'Filter by status (comma-separated, e.g., idle,working)')
    .option('--excludeStatus <status>', 'Exclude statuses (comma-separated, e.g., complete)')
    .option('-a, --assigned-to <agent>', 'Filter by assigned agent')
    .option('--exclude-subtasks', 'Exclude subtasks from results')
    .option('--include-archived', 'Include archived tasks')
    .option('-l, --limit <number>', 'Limit number of results', parseInt)
    .option('-o, --offset <number>', 'Offset for pagination', parseInt)
    .action(async (queueName: string, options, command) => {
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

        const filters = {
          queue_name: queueName,
          status: options.status
            ? options.status
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean).length === 1
              ? options.status.split(',')[0].trim()
              : options.status
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
            : undefined,
          exclude_status: options.excludeStatus
            ? options.excludeStatus
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : undefined,
          assigned_to: options.assignedTo,
          exclude_subtasks: options.excludeSubtasks,
          include_archived: options.includeArchived,
          limit: options.limit,
          offset: options.offset,
        };

        const tasks = await client.getQueueTasks(filters);

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: false,
        });

        console.log(formatter.format(tasks));
      } catch (error) {
        console.error(
          chalk.red('Error getting queue tasks:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // Add task to queue
  queue
    .command('add <task-id> <queue-name>')
    .description('Add a task to a queue')
    .action(async (taskId: string, queueName: string, options, command) => {
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

        const task_id = parseInt(taskId, 10);
        if (isNaN(task_id)) {
          console.error(chalk.red('Error: Task ID must be a number'));
          process.exit(1);
        }

        const client = await ensureConnected(config.url);
        await client.addTaskToQueue(task_id, queueName);

        console.log(chalk.green(`✓ Task #${task_id} added to queue "${queueName}"`));
      } catch (error) {
        console.error(
          chalk.red('Error adding task to queue:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // Remove task from queue
  queue
    .command('remove <task-id>')
    .description('Remove a task from its queue')
    .action(async (taskId: string, options, command) => {
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

        const task_id = parseInt(taskId, 10);
        if (isNaN(task_id)) {
          console.error(chalk.red('Error: Task ID must be a number'));
          process.exit(1);
        }

        const client = await ensureConnected(config.url);
        await client.removeTaskFromQueue(task_id);

        console.log(chalk.green(`✓ Task #${task_id} removed from queue`));
      } catch (error) {
        console.error(
          chalk.red('Error removing task from queue:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // Move task to different queue
  queue
    .command('move <task-id> <new-queue>')
    .description('Move a task to a different queue')
    .action(async (taskId: string, newQueue: string, options, command) => {
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

        const task_id = parseInt(taskId, 10);
        if (isNaN(task_id)) {
          console.error(chalk.red('Error: Task ID must be a number'));
          process.exit(1);
        }

        const client = await ensureConnected(config.url);
        await client.moveTaskToQueue(task_id, newQueue);

        console.log(chalk.green(`✓ Task #${task_id} moved to queue "${newQueue}"`));
      } catch (error) {
        console.error(
          chalk.red('Error moving task to queue:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  // Clear queue
  queue
    .command('clear <queue-name>')
    .description('Remove all tasks from a queue')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (queueName: string, options, command) => {
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

        // Confirmation prompt (unless --yes flag is used)
        if (!options.yes) {
          console.log(
            chalk.yellow(
              `Warning: This will remove all tasks from queue "${queueName}". Use --yes to confirm.`
            )
          );
          process.exit(0);
        }

        const client = await ensureConnected(config.url);
        await client.clearQueue(queueName);

        console.log(chalk.green(`✓ All tasks removed from queue "${queueName}"`));
      } catch (error) {
        console.error(
          chalk.red('Error clearing queue:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}

// Backwards compatibility: keep the old function name as an alias
export const createQueueCommand = createQueueCommands;
