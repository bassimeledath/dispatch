import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempDir, createMiseDir, createBoard, makeTask, cleanupDir } from '../helpers/fixtures.js';
import { loadBoard, getReadyTasks, getTask, getGroups, setTaskStatus, readStatus } from '../../src/core/board.js';

describe('Board', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('loads a valid board', () => {
    createBoard(miseDir, [makeTask('1'), makeTask('2')]);
    const board = loadBoard(miseDir);
    expect(board.tasks).toHaveLength(2);
    expect(board.tasks[0].id).toBe('1');
  });

  it('gets ready tasks with no deps', () => {
    createBoard(miseDir, [makeTask('1'), makeTask('2')]);
    const board = loadBoard(miseDir);
    const ready = getReadyTasks(miseDir, board);
    expect(ready).toHaveLength(2);
  });

  it('respects dependencies', () => {
    createBoard(miseDir, [
      makeTask('1'),
      makeTask('2', { depends_on: ['1'] }),
    ]);
    const board = loadBoard(miseDir);
    const ready = getReadyTasks(miseDir, board);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('1');
  });

  it('resolves deps after completion', () => {
    createBoard(miseDir, [
      makeTask('1'),
      makeTask('2', { depends_on: ['1'] }),
    ]);
    let board = loadBoard(miseDir);
    board = setTaskStatus(miseDir, board, '1', 'in_progress');
    board = setTaskStatus(miseDir, board, '1', 'complete');
    const ready = getReadyTasks(miseDir, board);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('2');
  });

  it('gets groups', () => {
    createBoard(miseDir, [
      makeTask('1', { group: 1 }),
      makeTask('2', { group: 2 }),
      makeTask('3', { group: 1 }),
    ]);
    const board = loadBoard(miseDir);
    expect(getGroups(board)).toEqual([1, 2]);
  });

  it('rejects invalid transitions', () => {
    createBoard(miseDir, [makeTask('1')]);
    const board = loadBoard(miseDir);
    expect(() => setTaskStatus(miseDir, board, '1', 'complete')).toThrow();
  });

  it('reads status', () => {
    createBoard(miseDir, [makeTask('1')]);
    const status = readStatus(miseDir, '1');
    expect(status?.status).toBe('pending');
  });
});
