import { simpleGit, type SimpleGit } from 'simple-git';

function git(cwd: string): SimpleGit {
  return simpleGit(cwd);
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
