import * as output from '../utils/output.js';
import * as git from '../utils/git.js';
import { branchName } from './worktree.js';
import type { Task } from '../types/board.js';

export interface MergeResult {
  success: boolean;
  conflicts: string[];
  mergedTasks: string[];
  failedTasks: string[];
}

export async function mergeGroup(
  projectDir: string,
  miseDir: string,
  tasks: Task[]
): Promise<MergeResult> {
  // Sort tasks by ID for deterministic merge order
  const sorted = [...tasks].sort((a, b) => a.id.localeCompare(b.id));

  const mergedTasks: string[] = [];
  const failedTasks: string[] = [];
  const allConflicts: string[] = [];

  for (const task of sorted) {
    const branch = branchName(task.id);
    output.info(`Merging branch ${branch}...`);

    const result = await git.mergeBranch(projectDir, branch);

    if (result.success) {
      mergedTasks.push(task.id);
      output.ok(`Merged task ${task.id}`);
    } else {
      failedTasks.push(task.id);
      allConflicts.push(...result.conflicts);
      output.error(`Merge conflict for task ${task.id}: ${result.conflicts.join(', ')}`);
    }
  }

  // Clean up branches
  for (const task of sorted) {
    try {
      await git.deleteBranch(projectDir, branchName(task.id));
    } catch {
      // Branch may not exist
    }
  }

  return {
    success: failedTasks.length === 0,
    conflicts: allConflicts,
    mergedTasks,
    failedTasks,
  };
}

export async function sequentialFallback(
  projectDir: string,
  miseDir: string,
  tasks: Task[],
  execute: (task: Task) => Promise<boolean>
): Promise<{ completed: string[]; failed: string[] }> {
  const completed: string[] = [];
  const failed: string[] = [];

  for (const task of tasks) {
    const success = await execute(task);
    if (success) {
      completed.push(task.id);
    } else {
      failed.push(task.id);
    }
  }

  return { completed, failed };
}
