import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createTempProject,
  createMiseDir,
  createStation,
  createBoard,
  makeTask,
  cleanupDir,
} from '../helpers/fixtures.js';
import { loadBoard, getReadyTasks, setTaskStatus, readStatus } from '../../src/core/board.js';
import { regenerate } from '../../src/core/brief.js';
import { logEntry, totalCost } from '../../src/core/progress.js';
import { acquire, release } from '../../src/core/lock.js';
import { TaskStatus } from '../../src/types/status.js';

describe('loop lifecycle (integration)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) cleanupDir(dir);
  });

  it('processes tasks in dependency order', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir);
    createBoard(miseDir, [
      makeTask('1', { group: 1 }),
      makeTask('2', { group: 2, depends_on: ['1'] }),
      makeTask('3', { group: 2, depends_on: ['1'] }),
    ]);

    // Simulate loop iteration 1: only task 1 should be ready
    let board = loadBoard(miseDir);
    let ready = getReadyTasks(miseDir, board);
    expect(ready.map((t) => t.id)).toEqual(['1']);

    // Complete task 1
    board = setTaskStatus(miseDir, board, '1', TaskStatus.IN_PROGRESS);
    board = setTaskStatus(miseDir, board, '1', TaskStatus.COMPLETE);

    // Now tasks 2 and 3 should be ready
    board = loadBoard(miseDir);
    ready = getReadyTasks(miseDir, board);
    expect(ready.map((t) => t.id).sort()).toEqual(['2', '3']);
  });

  it('tracks progress and costs', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir);
    createBoard(miseDir, [makeTask('1')]);

    logEntry(miseDir, { taskId: '1', status: 'complete', durationMs: 5000, tokensIn: 1000, tokensOut: 500, cost: 0.05 });

    expect(totalCost(miseDir)).toBeCloseTo(0.05, 2);
  });

  it('regenerates brief after completion', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir);
    createBoard(miseDir, [makeTask('1'), makeTask('2')]);

    let board = loadBoard(miseDir);
    board = setTaskStatus(miseDir, board, '1', TaskStatus.IN_PROGRESS);
    board = setTaskStatus(miseDir, board, '1', TaskStatus.COMPLETE);

    regenerate(miseDir);

    expect(existsSync(join(miseDir, 'brief.md'))).toBe(true);
    const brief = readFileSync(join(miseDir, 'brief.md'), 'utf-8');
    expect(brief).toContain('[x] 1');
    expect(brief).toContain('[ ] 2');
  });

  it('manages lock lifecycle', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);

    expect(acquire(miseDir)).toBe(true);
    expect(acquire(miseDir)).toBe(false);
    release(miseDir);
    expect(acquire(miseDir)).toBe(true);
    release(miseDir);
  });
});
