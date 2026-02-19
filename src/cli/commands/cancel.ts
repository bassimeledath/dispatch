import * as output from '../../utils/output.js';
import { getMiseDir, getTask, updateTask } from '../../core/state.js';
import { killWorker } from '../../core/worker.js';
import * as worktree from '../../parallel/worktree.js';

export async function cancelCommand(taskId: string): Promise<void> {
  const projectDir = process.cwd();
  const miseDir = getMiseDir(projectDir);
  const task = getTask(miseDir, taskId);

  if (!task) {
    output.error(`Task ${taskId} not found.`);
    process.exit(1);
  }

  if (task.status === 'cancelled') {
    output.warn(`Task ${taskId} is already cancelled.`);
    return;
  }

  if (task.status === 'complete') {
    output.warn(`Task ${taskId} is already complete.`);
    return;
  }

  if (task.pid) {
    await killWorker(task.id, task.pid);
    output.info(`Killed worker PID ${task.pid}`);
  }

  if (task.worktree) {
    try {
      await worktree.removeDir(projectDir, miseDir, taskId);
      output.info('Cleaned up worktree');
    } catch {
      output.warn('Worktree cleanup failed (may already be removed)');
    }
  }

  updateTask(miseDir, taskId, { status: 'cancelled', pid: null });
  output.ok(`Task ${taskId} cancelled.`);
}
