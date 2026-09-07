import chalk from 'chalk';
import { disconnect } from '../client/connection.js';

export class TinyTaskError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'TinyTaskError';
  }
}

/**
 * Exit the CLI cleanly: close the MCP transport before process.exit.
 *
 * Calling process.exit() while the Streamable HTTP client still has open
 * handles races libuv on Windows and can hard-abort the process with
 * STATUS_STACK_BUFFER_OVERRUN (exit -1073740791) instead of printing the
 * error. Route exits through here whenever a connection was opened (task #898).
 */
export async function gracefulShutdown(code: number): Promise<never> {
  try {
    await disconnect();
  } catch {
    // Ignore disconnect failures during shutdown
  }
  process.exit(code);
}

/**
 * Print an error message and shut down gracefully with the given exit code.
 */
export async function exitWithError(prefix: string, error: unknown, code = 1): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(prefix), message);
  if (process.env.TINYTASK_VERBOSE && error instanceof Error && error.stack) {
    console.error(chalk.gray(error.stack));
  }
  await gracefulShutdown(code);
}

export function handleError(error: Error): void {
  if (error instanceof TinyTaskError) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (error.code) {
      console.error(chalk.gray(`Code: ${error.code}`));
    }
  } else {
    console.error(chalk.red(`Unexpected error: ${error.message}`));
  }

  if (process.env.TINYTASK_VERBOSE) {
    console.error(chalk.gray(error.stack || ''));
  }

  process.exit(1);
}
