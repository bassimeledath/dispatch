import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupDir } from '../helpers/fixtures.js';
import { detectLanguage, detectFramework, detectPackageManager, detectProjectName } from '../../src/utils/detect.js';

describe('Detection', () => {
  let dir: string;

  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => cleanupDir(dir));

  it('detects typescript from package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"test"}', 'utf-8');
    expect(detectLanguage(dir)).toBe('typescript');
  });

  it('detects rust from Cargo.toml', () => {
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "myapp"\n', 'utf-8');
    expect(detectLanguage(dir)).toBe('rust');
  });

  it('detects go from go.mod', () => {
    writeFileSync(join(dir, 'go.mod'), 'module github.com/user/myapp\n', 'utf-8');
    expect(detectLanguage(dir)).toBe('go');
  });

  it('detects python from pyproject.toml', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "myapp"\n', 'utf-8');
    expect(detectLanguage(dir)).toBe('python');
  });

  it('returns null for unknown', () => {
    expect(detectLanguage(dir)).toBeNull();
  });

  it('detects react framework', () => {
    writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"^18"}}', 'utf-8');
    expect(detectFramework(dir)).toBe('react');
  });

  it('detects npm from package-lock', () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'package-lock.json'), '{}', 'utf-8');
    expect(detectPackageManager(dir)).toBe('npm');
  });

  it('detects pnpm from lockfile', () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
    expect(detectPackageManager(dir)).toBe('pnpm');
  });

  it('detects project name from package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"my-cool-project"}', 'utf-8');
    expect(detectProjectName(dir)).toBe('my-cool-project');
  });
});
