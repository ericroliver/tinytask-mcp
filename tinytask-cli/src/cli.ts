import { Command } from 'commander';
import chalk from 'chalk';
import { version } from './version.js';
import { createConfigCommands } from './commands/config.js';
import { createTaskCommands } from './commands/task/index.js';
import { createSubtaskCommands } from './commands/subtask.js';
import { createQueueCommands } from './commands/queue.js';
import { createSignupCommand } from './commands/signup.js';
import { createMoveCommand } from './commands/move.js';
import { createCommentCommands } from './commands/comment.js';
import { createLinkCommands } from './commands/link.js';
import { ensureConnected } from './client/connection.js';
import { loadConfig } from './config/loader.js';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('tinytask')
    .description('TinyTask CLI - Command-line task management')
    .version(version);

  // Global options
  program
    .option('--url <url>', 'TinyTask server URL')
    .option('--json', 'Output as JSON')
    .option('--no-color', 'Disable colored output')
    .option('--verbose', 'Enable verbose logging')
    .option('--profile <profile>', 'Configuration profile to use');

  // Config commands
  createConfigCommands(program);

  // Task commands
  createTaskCommands(program);

  // Subtask commands
  createSubtaskCommands(program);

  // Queue and workflow commands
  createQueueCommands(program);
  createSignupCommand(program);
  createMoveCommand(program);

  // Comment and link commands
  createCommentCommands(program);
  createLinkCommands(program);

  // Connectivity check
  program
    .command('ping')
    .description('Check connectivity to the TinyTask server')
    .action(async (_options, command) => {
      try {
        const config = await loadConfig({ url: command.optsWithGlobals().url });

        if (!config.url) {
          console.error(
            chalk.red('Error: No server URL configured. Use --url or configure a profile.')
          );
          process.exit(1);
        }

        const startedAt = Date.now();
        const client = await ensureConnected(config.url);
        await client.listQueues();
        const latencyMs = Date.now() - startedAt;

        console.log(chalk.green(`✓ TinyTask server reachable at ${config.url} (${latencyMs}ms)`));
      } catch (error) {
        console.error(
          chalk.red('✗ TinyTask server unreachable:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  return program;
}
