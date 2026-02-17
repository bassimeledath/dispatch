import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, createMiseDir, createStation, cleanupDir } from '../helpers/fixtures.js';
import { runAll } from '../../src/core/backpressure.js';
import { loadStation } from '../../src/utils/config.js';

describe('Backpressure', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('runs passing commands', () => {
    createStation(miseDir, { backpressure: { test: 'echo ok', lint: undefined, build: undefined, typecheck: undefined } });
    const station = loadStation(dir);
    const result = runAll(dir, miseDir, 'task-1', station);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].passed).toBe(true);
  });

  it('detects failing commands', () => {
    createStation(miseDir, { backpressure: { test: 'exit 1', lint: undefined, build: undefined, typecheck: undefined } });
    const station = loadStation(dir);
    const result = runAll(dir, miseDir, 'task-1', station);
    expect(result.passed).toBe(false);
  });

  it('logs output to files', () => {
    createStation(miseDir, { backpressure: { test: 'echo hello', lint: undefined, build: undefined, typecheck: undefined } });
    const station = loadStation(dir);
    runAll(dir, miseDir, 'task-1', station);
    expect(existsSync(join(miseDir, 'logs', 'task-1', 'test.log'))).toBe(true);
  });

  it('skips undefined commands', () => {
    createStation(miseDir, { backpressure: { test: undefined, lint: undefined, build: undefined, typecheck: undefined } });
    const station = loadStation(dir);
    const result = runAll(dir, miseDir, 'task-1', station);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});
