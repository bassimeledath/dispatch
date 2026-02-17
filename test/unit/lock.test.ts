import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, createMiseDir, cleanupDir } from '../helpers/fixtures.js';
import { acquire, release, isStale, recoverStale } from '../../src/core/lock.js';

describe('Lock', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('acquires lock', () => {
    expect(acquire(miseDir)).toBe(true);
    expect(existsSync(join(miseDir, 'run.lock'))).toBe(true);
  });

  it('prevents double acquire', () => {
    expect(acquire(miseDir)).toBe(true);
    expect(acquire(miseDir)).toBe(false);
  });

  it('releases lock', () => {
    acquire(miseDir);
    release(miseDir);
    expect(existsSync(join(miseDir, 'run.lock'))).toBe(false);
  });

  it('allows acquire after release', () => {
    acquire(miseDir);
    release(miseDir);
    expect(acquire(miseDir)).toBe(true);
  });

  it('detects non-stale lock', () => {
    acquire(miseDir);
    expect(isStale(miseDir, 120000)).toBe(false);
    release(miseDir);
  });
});
