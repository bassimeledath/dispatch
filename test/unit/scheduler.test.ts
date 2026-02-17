import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempDir, createMiseDir, createBoard, makeTask, cleanupDir } from '../helpers/fixtures.js';
import { nextBatch, pathsOverlap } from '../../src/parallel/scheduler.js';
import { loadBoard } from '../../src/core/board.js';

describe('Scheduler', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('returns single task when parallel is off', () => {
    createBoard(miseDir, [makeTask('1'), makeTask('2')]);
    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 'off', 4);
    expect(batch).toHaveLength(1);
  });

  it('returns batch for parallel-safe tasks', () => {
    createBoard(miseDir, [
      makeTask('1', { parallel_safe: true, owned_paths: ['src/a/**'] }),
      makeTask('2', { parallel_safe: true, owned_paths: ['src/b/**'] }),
    ]);
    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 'auto', 4);
    expect(batch).toHaveLength(2);
  });

  it('excludes overlapping paths', () => {
    createBoard(miseDir, [
      makeTask('1', { parallel_safe: true, owned_paths: ['src/shared/**'] }),
      makeTask('2', { parallel_safe: true, owned_paths: ['src/shared/utils/**'] }),
    ]);
    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 'auto', 4);
    expect(batch).toHaveLength(1);
  });

  it('detects path overlap', () => {
    expect(pathsOverlap(['src/a/**'], ['src/b/**'])).toBe(false);
    expect(pathsOverlap(['src/a/**'], ['src/a/b/**'])).toBe(true);
  });

  it('caps at maxParallel', () => {
    createBoard(miseDir, [
      makeTask('1', { parallel_safe: true, owned_paths: ['a/**'] }),
      makeTask('2', { parallel_safe: true, owned_paths: ['b/**'] }),
      makeTask('3', { parallel_safe: true, owned_paths: ['c/**'] }),
    ]);
    const board = loadBoard(miseDir);
    const batch = nextBatch(miseDir, board, 'auto', 2);
    expect(batch.length).toBeLessThanOrEqual(2);
  });
});
