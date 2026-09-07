import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { ensureConnected } from '../../client/connection.js';
import { exitWithError } from '../../utils/errors.js';
import { loadConfig } from '../../config/loader.js';

interface HistoryEntry {
  id?: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  return typeof value === 'object' && value !== null && 'field_name' in value;
}

export function createTaskHistoryCommand(task: Command): void {
  task
    .command('history <id>')
    .description('Show the audit-trail history for a task (chronological, oldest first)')
    .action(async (id: string, _options, command) => {
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
        const history = await client.getTaskHistory(parseInt(id, 10));

        if (command.optsWithGlobals().json) {
          console.log(JSON.stringify(history, null, 2));
          return;
        }

        if (!Array.isArray(history) || history.length === 0) {
          console.log(chalk.yellow(`No history recorded for task #${id}`));
          return;
        }

        const table = new Table({
          head: ['When', 'Field', 'Old → New', 'By'].map((h) => chalk.bold(h)),
          style: { head: [], border: [] },
        });

        for (const entry of history) {
          if (!isHistoryEntry(entry)) continue;
          const transition = `${entry.old_value ?? '—'} → ${entry.new_value ?? '—'}`;
          table.push([entry.changed_at, entry.field_name, transition, entry.changed_by ?? '—']);
        }

        console.log(chalk.bold(`History for task #${id} (${history.length} entries)`));
        console.log(table.toString());
      } catch (error) {
        await exitWithError('Error getting task history:', error);
      }
    });
}
