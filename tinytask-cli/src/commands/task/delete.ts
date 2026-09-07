import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { ensureConnected } from '../../client/connection.js';
import { exitWithError, gracefulShutdown } from '../../utils/errors.js';
import { loadConfig } from '../../config/loader.js';

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Parse a comma-separated list of task IDs into numeric IDs.
 * Throws on invalid (non-numeric or empty) entries.
 */
function parseIds(idInput: string): number[] {
  const parts = idInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    throw new Error('No task IDs provided.');
  }

  const ids: number[] = [];
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num <= 0) {
      throw new Error(`Invalid task ID: "${part}". Task IDs must be positive integers.`);
    }
    ids.push(num);
  }
  return ids;
}

export function createTaskDeleteCommand(program: Command): void {
  program
    .command('delete <ids>')
    .description('Delete one or more tasks (comma-separated IDs, e.g. "5,10,15")')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (ids: string, options, command) => {
      const jsonMode = command.optsWithGlobals().json;
      const results: Array<{ id: number; success: boolean; error?: string }> = [];

      try {
        const config = await loadConfig({
          url: command.optsWithGlobals().url,
        });

        if (!config.url) {
          console.error(
            chalk.red('Error: No server URL configured. Use --url or configure a profile.')
          );
          process.exit(1);
        }

        // Parse comma-separated IDs
        let taskIds: number[];
        try {
          taskIds = parseIds(ids);
        } catch (parseError) {
          console.error(
            chalk.red('Error:'),
            parseError instanceof Error ? parseError.message : String(parseError)
          );
          process.exit(1);
        }

        // Prompt for confirmation if not --yes and not in JSON mode
        if (!options.yes && !jsonMode) {
          const idList = taskIds.join(', ');
          console.log(chalk.yellow(`⚠️  Warning: This will permanently delete task(s): ${idList}`));
          const confirmed = await promptConfirmation(chalk.cyan('Are you sure? (y/N): '));

          if (!confirmed) {
            console.log(chalk.gray('Deletion cancelled.'));
            process.exit(0);
          }
        }

        const client = await ensureConnected(config.url);

        // Delete each task, collecting results
        let succeeded = 0;
        let failed = 0;

        for (const taskId of taskIds) {
          try {
            await client.deleteTask(taskId);
            results.push({ id: taskId, success: true });
            succeeded++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            results.push({ id: taskId, success: false, error: errorMsg });
            failed++;
          }
        }

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                results,
                succeeded,
                failed,
                total: taskIds.length,
              },
              null,
              2
            )
          );
        } else {
          // Per-task result output
          for (const result of results) {
            if (result.success) {
              console.log(chalk.green(`✓ Task #${result.id} deleted`));
            } else {
              console.error(chalk.red(`✗ Failed to delete task #${result.id}: ${result.error}`));
            }
          }

          // Summary
          if (taskIds.length > 1) {
            console.log(
              chalk.gray(`\n${succeeded} succeeded, ${failed} failed, ${taskIds.length} total`)
            );
          }
        }

        // Exit with error code if any failed
        if (failed > 0) {
          await gracefulShutdown(1);
        }
      } catch (error) {
        await exitWithError('Error deleting task(s):', error);
      }
    });
}
