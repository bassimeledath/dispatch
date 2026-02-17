import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempDir, createMiseDir, makeTask, cleanupDir } from '../helpers/fixtures.js';
import { checkTask, gate } from '../../src/core/readiness.js';

describe('Readiness', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('passes when no required inputs', () => {
    const task = makeTask('1');
    const result = checkTask(miseDir, task);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('fails when env var missing', () => {
    const task = makeTask('1', {
      required_inputs: { env_vars: ['MISE_TEST_MISSING_VAR_12345'], services: [], credentials: [], migrations: [] }
    });
    const result = checkTask(miseDir, task);
    expect(result.ready).toBe(false);
    expect(result.missing).toHaveLength(1);
  });

  it('passes when env var set', () => {
    process.env.MISE_TEST_PRESENT_VAR = 'hello';
    const task = makeTask('1', {
      required_inputs: { env_vars: ['MISE_TEST_PRESENT_VAR'], services: [], credentials: [], migrations: [] }
    });
    const result = checkTask(miseDir, task);
    expect(result.ready).toBe(true);
    delete process.env.MISE_TEST_PRESENT_VAR;
  });

  it('gate separates ready and blocked', () => {
    const tasks = [
      makeTask('1'),
      makeTask('2', { required_inputs: { env_vars: ['MISE_NONEXISTENT_99'], services: [], credentials: [], migrations: [] } }),
    ];
    const result = gate(miseDir, tasks);
    expect(result.ready).toHaveLength(1);
    expect(result.blocked).toHaveLength(1);
  });
});
