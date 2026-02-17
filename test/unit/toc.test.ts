import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, createMiseDir, cleanupDir } from '../helpers/fixtures.js';
import { generateToc, writeToc, hasDrifted, refreshIfNeeded } from '../../src/core/toc.js';

describe('TOC', () => {
  let dir: string;
  let miseDir: string;

  beforeEach(() => {
    dir = createTempDir();
    miseDir = createMiseDir(dir);
  });

  afterEach(() => cleanupDir(dir));

  it('generates toc from README', () => {
    writeFileSync(join(dir, 'README.md'), '# My Project\nSome content', 'utf-8');
    const entries = generateToc(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('README.md');
    expect(entries[0].purpose).toBe('My Project');
  });

  it('writes toc.md and meta', () => {
    writeFileSync(join(dir, 'README.md'), '# Test\n', 'utf-8');
    writeToc(miseDir, dir);
    expect(existsSync(join(miseDir, 'toc.md'))).toBe(true);
    expect(existsSync(join(miseDir, 'toc.meta.yaml'))).toBe(true);
  });

  it('detects drift', () => {
    writeFileSync(join(dir, 'README.md'), '# Test\n', 'utf-8');
    writeToc(miseDir, dir);
    expect(hasDrifted(miseDir, dir)).toBe(false);
    writeFileSync(join(dir, 'README.md'), '# Changed\n', 'utf-8');
    expect(hasDrifted(miseDir, dir)).toBe(true);
  });

  it('refreshes on drift', () => {
    writeFileSync(join(dir, 'README.md'), '# V1\n', 'utf-8');
    writeToc(miseDir, dir);
    writeFileSync(join(dir, 'README.md'), '# V2\n', 'utf-8');
    const refreshed = refreshIfNeeded(miseDir, dir);
    expect(refreshed).toBe(true);
    const toc = readFileSync(join(miseDir, 'toc.md'), 'utf-8');
    expect(toc).toContain('V2');
  });
});
