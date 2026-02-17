import { describe, it, expect, afterEach } from 'vitest';
import {
  createTempProject,
  createMiseDir,
  createStation,
  createBoard,
  makeTask,
  cleanupDir,
} from '../helpers/fixtures.js';
import { nextBatch } from '../../src/parallel/scheduler.js';
import { loadBoard } from '../../src/core/board.js';

describe('parallel scheduling (integration)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) cleanupDir(dir);
  });

  it('selects parallel batch with non-overlapping paths', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir, {
      mode: { attended: false, parallel: 'auto', max_parallel: 4, max_retries: 2, skip_failures: false },
    });
    createBoard(miseDir, [
      makeTask('1', { parallel_safe: true, owned_paths: ['src/auth/**'] }),
      makeTask('2', { parallel_safe: true, owned_paths: ['src/api/**'] }),
      makeTask('3', { parallel_safe: true, owned_paths: ['src/ui/**'] }),
    ]);

    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 'auto', 4);
    expect(batch.length).toBe(3);
  });

  it('limits batch to numeric parallel setting', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir);
    createBoard(miseDir, [
      makeTask('1', { parallel_safe: true, owned_paths: ['a/**'] }),
      makeTask('2', { parallel_safe: true, owned_paths: ['b/**'] }),
      makeTask('3', { parallel_safe: true, owned_paths: ['c/**'] }),
    ]);

    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 2, 4);
    expect(batch.length).toBeLessThanOrEqual(2);
  });

  it('falls back to single for non-parallel-safe tasks', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir);
    createBoard(miseDir, [
      makeTask('1', { parallel_safe: false }),
      makeTask('2', { parallel_safe: false }),
    ]);

    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 'auto', 4);
    expect(batch.length).toBe(1);
  });
});
