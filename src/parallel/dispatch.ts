import * as output from '../utils/output.js';
import { create as createWorktree, removeDir as removeWorktreeDir } from './worktree.js';
import { executeTask, type ExecuteResult } from '../cli/commands/run.js';
import { loadBoard } from '../core/board.js';
import type { Task } from '../types/board.js';
import type { Station } from '../types/station.js';
import type { SignalContext } from '../core/signals.js';

export async function dispatchBatch(
  projectDir: string,
  miseDir: string,
  station: Station,
  tasks: Task[],
  runId: string,
  maxRetries: number,
  verbose?: boolean,
  signalCtx?: SignalContext
): Promise<ExecuteResult[]> {
  // Create worktrees for each task
  const worktrees: { task: Task; path: string }[] = [];

  try {
    for (const task of tasks) {
      const wtPath = await createWorktree(projectDir, miseDir, task.id);
      worktrees.push({ task, path: wtPath });
      output.ok(`Created worktree for task ${task.id}`);
    }

    // Execute tasks concurrently
    const promises = worktrees.map(({ task, path }) => {
      const board = loadBoard(miseDir);
      return executeTask(
        path, // Use worktree path as project dir
        miseDir,
        station,
        board,
        task,
        runId,
        1,
        maxRetries,
        verbose,
        undefined,
        signalCtx
      );
    });

    const results = await Promise.all(promises);

    return results;
  } finally {
    // Clean up worktree directories only — branches are needed for merge
    for (const { task } of worktrees) {
      try {
        await removeWorktreeDir(projectDir, miseDir, task.id);
      } catch (err) {
        output.warn(`Failed to remove worktree for task ${task.id}`);
      }
    }
  }
}
