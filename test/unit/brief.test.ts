import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, createMiseDir, createBoard, makeTask, cleanupDir } from '../helpers/fixtures.js';
import { regenerate } from '../../src/core/brief.js';
import { setTaskStatus } from '../../src/core/board.js';
import { loadBoard } from '../../src/core/board.js';

describe('Brief', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('generates brief with all sections', () => {
    createBoard(miseDir, [makeTask('1'), makeTask('2')]);
    regenerate(miseDir);
    const brief = readFileSync(join(miseDir, 'brief.md'), 'utf-8');
    expect(brief).toContain('# Brief');
    expect(brief).toContain('## Recent Completions');
    expect(brief).toContain('## Open Blockers');
    expect(brief).toContain('## Active Assumptions');
    expect(brief).toContain('## Next Ready Tasks');
  });

  it('shows completed tasks', () => {
    createBoard(miseDir, [makeTask('1'), makeTask('2')]);
    let board = loadBoard(miseDir);
    board = setTaskStatus(miseDir, board, '1', 'in_progress');
    board = setTaskStatus(miseDir, board, '1', 'complete');
    regenerate(miseDir);
    const brief = readFileSync(join(miseDir, 'brief.md'), 'utf-8');
    expect(brief).toContain('[x] 1');
  });

  it('shows ready tasks', () => {
    createBoard(miseDir, [makeTask('1'), makeTask('2', { depends_on: ['1'] })]);
    regenerate(miseDir);
    const brief = readFileSync(join(miseDir, 'brief.md'), 'utf-8');
    expect(brief).toContain('[ ] 1');
    expect(brief).not.toContain('[ ] 2');
  });

  it('does nothing without board', () => {
    regenerate(miseDir);
    expect(existsSync(join(miseDir, 'brief.md'))).toBe(false);
  });
});
