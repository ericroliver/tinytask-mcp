import { Command } from 'commander';
import chalk from 'chalk';
import { ensureConnected } from '../client/connection.js';
import { exitWithError } from '../utils/errors.js';
import { createFormatter } from '../formatters/index.js';
import { loadConfig } from '../config/loader.js';

export function createSignupCommand(program: Command): void {
  program
    .command('signup')
    .description('Sign up for next available task in your queue')
    .option('-a, --agent <name>', 'Agent name (defaults to config)')
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

        const agentName = options.agent || config.agent;
        if (!agentName) {
          console.error(chalk.red('Error: No agent specified and no agent configured'));
          console.error(chalk.gray('Use: tinytask signup --agent <name>'));
          console.error(chalk.gray('Or set the TKO_AGENT environment variable'));
          process.exit(1);
        }

        const client = await ensureConnected(config.url);
        const task = await client.signupForTask(agentName);

        if (!task) {
          if (command.optsWithGlobals().json) {
            console.log('null');
          } else {
            console.log(chalk.yellow('No idle tasks available in your queue'));
          }
          return;
        }

        const formatter = createFormatter(config.outputFormat, {
          color: config.colorOutput,
          verbose: true,
        });

        console.log(formatter.format(task));

        if (config.outputFormat === 'table') {
          const t = task as Record<string, unknown>;
          console.log(chalk.green(`\n✓ Claimed task #${t.id}: ${t.title}`));
        }
      } catch (error) {
        await exitWithError('Error signing up for task:', error);
      }
    });
}
