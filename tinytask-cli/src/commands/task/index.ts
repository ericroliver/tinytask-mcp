import { Command } from 'commander';
import { createTaskCreateCommand } from './create.js';
import { createTaskGetCommand } from './get.js';
import { createTaskUpdateCommand } from './update.js';
import { createTaskDeleteCommand } from './delete.js';
import { createTaskListCommand } from './list.js';
import { createTaskArchiveCommand } from './archive.js';
import { createTaskHistoryCommand } from './history.js';

export function createTaskCommands(program: Command): void {
  const task = program.command('task').alias('t').description('Task operations');

  createTaskCreateCommand(task);
  createTaskGetCommand(task);
  createTaskUpdateCommand(task);
  createTaskDeleteCommand(task);
  createTaskListCommand(task);
  createTaskArchiveCommand(task);
  createTaskHistoryCommand(task);
}
