import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as output from '../../utils/output.js';
import { getMiseDir, getTask } from '../../core/state.js';

export async function logCommand(taskId: string): Promise<void> {
  const miseDir = getMiseDir(process.cwd());
  const task = getTask(miseDir, taskId);

  if (!task) {
    output.error(`Task ${taskId} not found.`);
    process.exit(1);
  }

  const logPath = join(miseDir, 'tasks', taskId, 'log.txt');
  if (!existsSync(logPath)) {
    output.info(`No log yet for task ${taskId} (status: ${task.status})`);
    return;
  }

  process.stdout.write(readFileSync(logPath, 'utf-8'));
}
