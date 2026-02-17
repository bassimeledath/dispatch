import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface DetectionResult {
  name: string;
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  backpressure: {
    test: string | null;
    lint: string | null;
    build: string | null;
    typecheck: string | null;
  };
}

function readJsonSafe(path: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function detectProjectName(projectDir: string): string {
  const pkg = readJsonSafe(join(projectDir, 'package.json'));
  if (pkg?.name) return pkg.name;

  const cargo = join(projectDir, 'Cargo.toml');
  if (existsSync(cargo)) {
    const content = readFileSync(cargo, 'utf-8');
    const match = content.match(/^\s*name\s*=\s*"(.+?)"/m);
    if (match) return match[1];
  }

  const pyproject = join(projectDir, 'pyproject.toml');
  if (existsSync(pyproject)) {
    const content = readFileSync(pyproject, 'utf-8');
    const match = content.match(/^\s*name\s*=\s*"(.+?)"/m);
    if (match) return match[1];
  }

  const goMod = join(projectDir, 'go.mod');
  if (existsSync(goMod)) {
    const content = readFileSync(goMod, 'utf-8');
    const match = content.match(/^module\s+(.+)/m);
    if (match) return match[1].split('/').pop() ?? match[1];
  }

  return basename(projectDir);
}

export function detectLanguage(projectDir: string): string | null {
  if (existsSync(join(projectDir, 'package.json'))) return 'typescript';
  if (existsSync(join(projectDir, 'tsconfig.json'))) return 'typescript';
  if (existsSync(join(projectDir, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(projectDir, 'go.mod'))) return 'go';
  if (existsSync(join(projectDir, 'pyproject.toml'))) return 'python';
  if (existsSync(join(projectDir, 'requirements.txt'))) return 'python';
  if (existsSync(join(projectDir, 'Gemfile'))) return 'ruby';
  if (existsSync(join(projectDir, 'pom.xml'))) return 'java';
  if (existsSync(join(projectDir, 'build.gradle'))) return 'java';
  if (existsSync(join(projectDir, 'build.gradle.kts'))) return 'kotlin';
  if (existsSync(join(projectDir, 'Package.swift'))) return 'swift';
  if (existsSync(join(projectDir, 'mix.exs'))) return 'elixir';
  return null;
}

export function detectFramework(projectDir: string): string | null {
  const pkg = readJsonSafe(join(projectDir, 'package.json'));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };

  // JS/TS frameworks
  if (existsSync(join(projectDir, 'next.config.js')) || existsSync(join(projectDir, 'next.config.mjs')) || existsSync(join(projectDir, 'next.config.ts'))) return 'nextjs';
  if (existsSync(join(projectDir, 'angular.json'))) return 'angular';
  if (existsSync(join(projectDir, 'nuxt.config.ts')) || existsSync(join(projectDir, 'nuxt.config.js'))) return 'nuxt';
  if (existsSync(join(projectDir, 'svelte.config.js'))) return 'svelte';
  if (existsSync(join(projectDir, 'astro.config.mjs'))) return 'astro';
  if (deps?.['react']) return 'react';
  if (deps?.['vue']) return 'vue';
  if (deps?.['express']) return 'express';
  if (deps?.['fastify']) return 'fastify';
  if (deps?.['hono']) return 'hono';

  // Python frameworks
  const pyproject = join(projectDir, 'pyproject.toml');
  if (existsSync(pyproject)) {
    const content = readFileSync(pyproject, 'utf-8');
    if (content.includes('django')) return 'django';
    if (content.includes('fastapi')) return 'fastapi';
    if (content.includes('flask')) return 'flask';
  }

  // Ruby frameworks
  const gemfile = join(projectDir, 'Gemfile');
  if (existsSync(gemfile)) {
    const content = readFileSync(gemfile, 'utf-8');
    if (content.includes('rails')) return 'rails';
    if (content.includes('sinatra')) return 'sinatra';
  }

  return null;
}

export function detectPackageManager(projectDir: string): string | null {
  if (existsSync(join(projectDir, 'bun.lockb')) || existsSync(join(projectDir, 'bun.lock'))) return 'bun';
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectDir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectDir, 'package-lock.json'))) return 'npm';
  if (existsSync(join(projectDir, 'package.json'))) return 'npm';
  if (existsSync(join(projectDir, 'Cargo.lock'))) return 'cargo';
  if (existsSync(join(projectDir, 'go.sum'))) return 'go';
  if (existsSync(join(projectDir, 'poetry.lock'))) return 'poetry';
  if (existsSync(join(projectDir, 'uv.lock'))) return 'uv';
  if (existsSync(join(projectDir, 'Pipfile.lock'))) return 'pipenv';
  if (existsSync(join(projectDir, 'Gemfile.lock'))) return 'bundler';
  return null;
}

export function detectBackpressureCommands(
  projectDir: string,
  language: string | null,
  packageManager: string | null
): { test: string | null; lint: string | null; build: string | null; typecheck: string | null } {
  const pkg = readJsonSafe(join(projectDir, 'package.json'));
  const scripts = pkg?.scripts ?? {};
  const run = packageManager === 'yarn' ? 'yarn' : packageManager === 'pnpm' ? 'pnpm' : packageManager === 'bun' ? 'bun' : 'npm run';

  const result = { test: null as string | null, lint: null as string | null, build: null as string | null, typecheck: null as string | null };

  if (language === 'typescript' || language === 'javascript') {
    if (scripts.test) result.test = `${run} test`;
    if (scripts.lint) result.lint = `${run} lint`;
    if (scripts.build) result.build = `${run} build`;
    if (scripts.typecheck) result.typecheck = `${run} typecheck`;
    else if (existsSync(join(projectDir, 'tsconfig.json'))) result.typecheck = 'npx tsc --noEmit';
  } else if (language === 'rust') {
    result.test = 'cargo test';
    result.build = 'cargo build';
    result.lint = 'cargo clippy';
    result.typecheck = 'cargo check';
  } else if (language === 'go') {
    result.test = 'go test ./...';
    result.build = 'go build ./...';
    result.lint = 'golangci-lint run';
  } else if (language === 'python') {
    if (existsSync(join(projectDir, 'pytest.ini')) || existsSync(join(projectDir, 'pyproject.toml'))) {
      result.test = 'pytest';
    }
    result.lint = 'ruff check .';
    result.typecheck = 'mypy .';
  }

  // Check for Makefile targets
  const makefile = join(projectDir, 'Makefile');
  if (existsSync(makefile)) {
    const content = readFileSync(makefile, 'utf-8');
    if (!result.test && content.match(/^test:/m)) result.test = 'make test';
    if (!result.lint && content.match(/^lint:/m)) result.lint = 'make lint';
    if (!result.build && content.match(/^build:/m)) result.build = 'make build';
  }

  return result;
}

export function detect(projectDir: string): DetectionResult {
  const language = detectLanguage(projectDir);
  const packageManager = detectPackageManager(projectDir);
  return {
    name: detectProjectName(projectDir),
    language,
    framework: detectFramework(projectDir),
    packageManager,
    backpressure: detectBackpressureCommands(projectDir, language, packageManager),
  };
}
