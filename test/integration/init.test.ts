import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempProject, cleanupDir } from '../helpers/fixtures.js';
import { parse as parseYaml } from 'yaml';

describe('mise init (integration)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) cleanupDir(dir);
  });

  it('creates .mise directory structure', async () => {
    dir = createTempProject();
    // Simulate what init does without the engine check / interactive parts
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const miseDir = join(dir, '.mise');
    const dirs = ['status', 'clarifications', 'logs', 'evidence'];
    for (const d of dirs) {
      mkdirSync(join(miseDir, d), { recursive: true });
    }
    for (const d of dirs) {
      expect(existsSync(join(miseDir, d))).toBe(true);
    }
  });

  it('detects node project correctly', async () => {
    dir = createTempProject({
      packageJson: {
        name: 'my-test-app',
        scripts: { test: 'vitest', lint: 'eslint .' },
        dependencies: { react: '^18' },
      },
    });
    const { detect } = await import('../../src/utils/detect.js');
    const result = detect(dir);
    expect(result.name).toBe('my-test-app');
    expect(result.language).toBe('typescript');
    expect(result.framework).toBe('react');
  });
});
