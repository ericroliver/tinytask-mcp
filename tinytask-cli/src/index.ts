#!/usr/bin/env node

import chalk from 'chalk';
import { createCLI } from './cli.js';
import { handleError, gracefulShutdown } from './utils/errors.js';
import { disconnect } from './client/connection.js';

// Last-resort handlers: an unhandled async error must print a clean message
// and exit 1 — never hard-abort the process (libuv fastfail on Windows SEA
// builds, exit -1073740791). See task #898.
process.on('unhandledRejection', (reason) => {
  console.error(
    chalk.red('Unexpected async error:'),
    reason instanceof Error ? reason.message : String(reason)
  );
  void gracefulShutdown(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Unexpected error:'), error.message);
  void gracefulShutdown(1);
});

async function main() {
  try {
    const cli = createCLI();
    await cli.parseAsync(process.argv);
    // Ensure client disconnects after command completes
    await disconnect();
  } catch (error) {
    await disconnect();
    handleError(error as Error);
  }
}

main();
