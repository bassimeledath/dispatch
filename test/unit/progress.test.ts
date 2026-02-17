import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempDir, createMiseDir, cleanupDir } from '../helpers/fixtures.js';
import { logEntry, totalCost, recentEntries } from '../../src/core/progress.js';

describe('Progress', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('logs entries', () => {
    logEntry(miseDir, { taskId: '1', status: 'complete', durationMs: 5000, tokensIn: 100, tokensOut: 200, cost: 0.01 });
    const entries = recentEntries(miseDir, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('1');
    expect(entries[0]).toContain('complete');
  });

  it('sums costs', () => {
    logEntry(miseDir, { taskId: '1', status: 'complete', durationMs: 5000, tokensIn: 100, tokensOut: 200, cost: 0.01 });
    logEntry(miseDir, { taskId: '2', status: 'complete', durationMs: 3000, tokensIn: 50, tokensOut: 100, cost: 0.005 });
    expect(totalCost(miseDir)).toBeCloseTo(0.015, 3);
  });

  it('returns recent entries', () => {
    for (let i = 0; i < 5; i++) {
      logEntry(miseDir, { taskId: String(i), status: 'complete', durationMs: 1000, tokensIn: null, tokensOut: null, cost: null });
    }
    expect(recentEntries(miseDir, 3)).toHaveLength(3);
  });

  it('handles empty log', () => {
    expect(totalCost(miseDir)).toBe(0);
    expect(recentEntries(miseDir, 10)).toEqual([]);
  });
});
