import { Command } from 'commander';
import chalk from 'chalk';
import { ensureConnected } from '../client/connection.js';
import { createFormatter } from '../formatters/index.js';
import { loadConfig } from '../config/loader.js';
import { resolveContent } from '../utils/stdin.js';

export function createMoveCommand(program: Command): void {
  program
    .command('move <id> <to-agent>')
    .description('Transfer task to another agent')
    .option('-f, --from <agent>', 'Current agent (defaults to config)')
    .option('-m, --comment <text>', 'Handoff comment', 'Task transferred')
    .option('--stdin', 'Read comment from stdin instead of -m option')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  # Short comment via -m option',
        '  tinytask move 5 tko-shield -m "Defect fixed, please verify"',
        '',
        '  # Long/multi-line comment via stdin (avoids shell issues with backticks, $, etc.)',
        "  tinytask move 5 tko-shield --stdin <<'EOF'",
        '  Handoff: Fixed `hostname` injection in comment handler.',
        '  See commit `abc123` and file `src/commands/comment.ts`.',
        '  EOF',
        '',
        '  # Always use --stdin with a quoted heredoc for content containing',
        '  # backticks, $, or other shell metacharacters to prevent command substitution.',
      ].join('\n')
    )
    .action(async (id: string, toAgent: string, options, command) => {
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

        const fromAgent = options.from || config.agent;
        if (!fromAgent) {
          console.error(chalk.red('Error: No current agent specified and no agent configured'));
          console.error(chalk.gray('Use: tinytask move <id> <to-agent> --from <current-agent>'));
          console.error(chalk.gray('Or set the TKO_AGENT environment variable'));
          process.exit(1);
        }

        const client = await ensureConnected(config.url);

        // Resolve comment: use stdin if --stdin flag is set, otherwise use -m option
        const comment = await resolveContent(options.stdin, options.comment);

        const result = (await client.moveTask(parseInt(id), fromAgent, toAgent, comment)) as {
          task?: Record<string, unknown>;
          comment?: Record<string, unknown>;
        };

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: true,
        });

        // moveTask returns { task, comment } — format the task part
        const task = result.task ?? result;
        console.log(formatter.format(task));

        if (config.outputFormat === 'table') {
          console.log(chalk.green(`\n✓ Task #${id} transferred from ${fromAgent} to ${toAgent}`));
        }
      } catch (error) {
        console.error(
          chalk.red('Error moving task:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}
