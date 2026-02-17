import { getReadyTasks, getGroups, getGroupTasks } from '../core/board.js';
import type { Board, Task } from '../types/board.js';
import { getTaskStatus } from '../core/board.js';
import { TaskStatus } from '../types/status.js';
import { minimatch } from '../parallel/glob-utils.js';

export function nextBatch(
  miseDir: string,
  board: Board,
  parallelMode: 'off' | 'auto' | number,
  maxParallel: number,
  readyTasks?: Task[]
): Task[] {
  const ready = readyTasks ?? getReadyTasks(miseDir, board);
  if (ready.length === 0) return [];

  // Single task mode
  if (parallelMode === 'off' || ready.length === 1) {
    return [ready[0]];
  }

  const cap = typeof parallelMode === 'number' ? parallelMode : maxParallel;

  // Find lowest incomplete group
  const groups = getGroups(board);
  for (const group of groups) {
    const groupTasks = getGroupTasks(board, group);
    const allComplete = groupTasks.every(
      (t) => getTaskStatus(miseDir, t.id) === TaskStatus.COMPLETE
    );
    if (allComplete) continue;

    // Get parallel-safe ready tasks in this group
    const parallelReady = ready.filter(
      (t) => t.group === group && t.parallel_safe
    );

    if (parallelReady.length <= 1) {
      // Not enough parallel tasks, run single
      return [ready[0]];
    }

    // Check for path overlaps
    const batch = selectNonOverlapping(parallelReady, cap);
    return batch.length > 0 ? batch : [ready[0]];
  }

  return [ready[0]];
}

function selectNonOverlapping(tasks: Task[], maxCount: number): Task[] {
  const selected: Task[] = [];

  for (const task of tasks) {
    if (selected.length >= maxCount) break;

    const overlaps = selected.some((s) => pathsOverlap(s.owned_paths, task.owned_paths));
    if (!overlaps) {
      selected.push(task);
    }
  }

  return selected;
}

export function pathsOverlap(pathsA: string[], pathsB: string[]): boolean {
  if (pathsA.length === 0 || pathsB.length === 0) {
    // If either has no paths specified, assume potential overlap
    return pathsA.length === 0 && pathsB.length === 0;
  }

  for (const a of pathsA) {
    for (const b of pathsB) {
      if (globOverlap(a, b)) return true;
    }
  }
  return false;
}

function globOverlap(patternA: string, patternB: string): boolean {
  // Simple overlap detection:
  // Check if one pattern matches a representative path of the other
  // For exact paths, this is straightforward
  // For globs, we check if the prefix directories overlap

  // Direct match
  if (patternA === patternB) return true;

  // Check if one is a prefix of the other (directory containment)
  const baseA = patternA.replace(/\*\*?.*$/, '').replace(/\/+$/, '');
  const baseB = patternB.replace(/\*\*?.*$/, '').replace(/\/+$/, '');

  if (baseA && baseB) {
    return baseA.startsWith(baseB) || baseB.startsWith(baseA);
  }

  // If either pattern is just a wildcard, they could overlap
  return false;
}
