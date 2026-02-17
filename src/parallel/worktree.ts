import { join } from 'node:path';
import { existsSync } from 'node:fs';
import * as git from '../utils/git.js';

function worktreePath(miseDir: string, taskId: string): string {
  return join(miseDir, 'worktrees', taskId);
}

function branchName(taskId: string): string {
  return `mise/task-${taskId}`;
}

export async function create(
  projectDir: string,
  miseDir: string,
  taskId: string
): Promise<string> {
  const wtPath = worktreePath(miseDir, taskId);
  const branch = branchName(taskId);

  await git.worktreeAdd(projectDir, wtPath, branch);
  return wtPath;
}

export async function removeDir(
  projectDir: string,
  miseDir: string,
  taskId: string
): Promise<void> {
  const wtPath = worktreePath(miseDir, taskId);
  try {
    await git.worktreeRemove(projectDir, wtPath);
  } catch {
    // Worktree may already be removed
  }
}

export async function removeBranch(
  projectDir: string,
  taskId: string
): Promise<void> {
  const branch = branchName(taskId);
  try {
    await git.deleteBranch(projectDir, branch);
  } catch {
    // Branch may already be deleted
  }
}

export async function remove(
  projectDir: string,
  miseDir: string,
  taskId: string
): Promise<void> {
  await removeDir(projectDir, miseDir, taskId);
  await removeBranch(projectDir, taskId);
}

export async function isSupported(projectDir: string): Promise<boolean> {
  try {
    const isGitRepo = await git.isRepo(projectDir);
    if (!isGitRepo) return false;
    // Check worktree capability by listing worktrees
    await git.worktreeList(projectDir);
    return true;
  } catch {
    return false;
  }
}

export { worktreePath, branchName };
