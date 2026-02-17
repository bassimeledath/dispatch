import { lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

function git(cwd: string): SimpleGit {
  return simpleGit(cwd);
}

/** File metadata snapshot for change detection. */
export interface FileSnapshot {
  [relativePath: string]: { mtimeMs: number; size: number };
}

const SNAPSHOT_IGNORE = new Set(['.git', 'node_modules', '.mise', '__pycache__', '.venv', 'dist', '.next']);

/**
 * Take a snapshot of file metadata in the working tree.
 * Call this BEFORE task execution to establish a baseline.
 */
export function snapshot(cwd: string): FileSnapshot {
  const snap: FileSnapshot = {};
  walkDir(cwd, cwd, snap);
  return snap;
}

function walkDir(root: string, dir: string, snap: FileSnapshot): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SNAPSHOT_IGNORE.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(root, fullPath, snap);
    } else if (entry.isFile()) {
      try {
        const stat = lstatSync(fullPath);
        snap[relative(root, fullPath)] = { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch {
        // skip files we can't stat
      }
    }
  }
}

/**
 * Compare current file state against a previous snapshot.
 * Returns list of files that were added or modified.
 */
export function changedFiles(cwd: string, before: FileSnapshot): string[] {
  const after: FileSnapshot = {};
  walkDir(cwd, cwd, after);
  const changed: string[] = [];

  // New or modified files
  for (const [path, stat] of Object.entries(after)) {
    const prev = before[path];
    if (!prev || prev.mtimeMs !== stat.mtimeMs || prev.size !== stat.size) {
      changed.push(path);
    }
  }

  // Deleted files
  for (const path of Object.keys(before)) {
    if (!(path in after)) {
      changed.push(path);
    }
  }

  return changed;
}

/**
 * Stage specific files instead of `git add -A`.
 * Handles both modified/new files (add) and deleted files (rm).
 */
export async function stageFiles(cwd: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await git(cwd).add(files);
}

export async function isRepo(cwd: string): Promise<boolean> {
  try {
    return await git(cwd).checkIsRepo();
  } catch {
    return false;
  }
}

export async function currentBranch(cwd: string): Promise<string> {
  const result = await git(cwd).branch();
  return result.current;
}

export async function hasChanges(cwd: string): Promise<boolean> {
  const status = await git(cwd).status();
  return !status.isClean();
}

export async function stageAll(cwd: string): Promise<void> {
  await git(cwd).add('-A');
}

export async function miseCommit(
  cwd: string,
  taskId: string,
  title: string,
  runId: string
): Promise<void> {
  const message = `mise(${taskId}): ${title}`;
  await git(cwd).commit(message, undefined, {
    '--trailer': `Mise-Run-Id: ${runId}`,
  });
}

export async function hasTaskCommit(cwd: string, taskId: string): Promise<boolean> {
  try {
    const log = await git(cwd).log({ '--grep': `mise(${taskId}):` });
    return log.total > 0;
  } catch {
    return false;
  }
}

export async function createBranch(cwd: string, name: string): Promise<void> {
  await git(cwd).checkoutLocalBranch(name);
}

export async function checkoutBranch(cwd: string, name: string): Promise<void> {
  await git(cwd).checkout(name);
}

export async function deleteBranch(cwd: string, name: string): Promise<void> {
  await git(cwd).deleteLocalBranch(name, true);
}

export async function mergeBranch(
  cwd: string,
  branch: string,
  noFf = true
): Promise<{ success: boolean; conflicts: string[] }> {
  try {
    const options = noFf ? ['--no-ff'] : [];
    await git(cwd).merge([branch, ...options]);
    return { success: true, conflicts: [] };
  } catch (err: any) {
    const conflicts = err?.git?.conflicts ?? [];
    // Abort the failed merge
    try {
      await git(cwd).merge(['--abort']);
    } catch {
      // ignore abort errors
    }
    return { success: false, conflicts };
  }
}

export async function worktreeAdd(
  cwd: string,
  path: string,
  branch: string
): Promise<void> {
  await git(cwd).raw(['worktree', 'add', path, '-b', branch]);
}

export async function worktreeRemove(cwd: string, path: string): Promise<void> {
  await git(cwd).raw(['worktree', 'remove', path, '--force']);
}

export async function worktreeList(cwd: string): Promise<string[]> {
  const result = await git(cwd).raw(['worktree', 'list', '--porcelain']);
  const worktrees: string[] = [];
  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      worktrees.push(line.slice('worktree '.length));
    }
  }
  return worktrees;
}

export async function initRepo(cwd: string): Promise<void> {
  await git(cwd).init();
}

export { git as getSimpleGit };
