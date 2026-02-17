import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { stringify as stringifyYaml } from 'yaml';
import type { Board } from '../../src/types/board.js';
import type { Station } from '../../src/types/station.js';

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'mise-test-'));
}

export function createTempProject(opts?: { language?: string; packageJson?: Record<string, any> }): string {
  const dir = createTempDir();

  // Init git repo
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });

  // Create package.json
  const pkg = opts?.packageJson ?? {
    name: 'test-project',
    version: '1.0.0',
    scripts: {
      test: 'echo "ok"',
      lint: 'echo "ok"',
      build: 'echo "ok"',
    },
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

  // Initial commit
  execSync('git add -A && git commit -m "initial"', { cwd: dir, stdio: 'ignore' });

  return dir;
}

export function createMiseDir(projectDir: string): string {
  const miseDir = join(projectDir, '.mise');
  const dirs = ['status', 'clarifications', 'logs', 'evidence'];
  for (const d of dirs) {
    mkdirSync(join(miseDir, d), { recursive: true });
  }
  return miseDir;
}

export function createStation(miseDir: string, overrides?: Partial<Station>): void {
  const station: Station = {
    project: { name: 'test-project', language: 'typescript', framework: undefined, package_manager: 'npm' },
    backpressure: { test: 'echo ok', lint: undefined, build: undefined, typecheck: undefined },
    rules: [],
    boundaries: [],
    engine: { name: 'claude', model: 'sonnet', allowed_tools: [], max_budget_usd: undefined },
    mode: { attended: false, parallel: 'off', max_parallel: 4, max_retries: 2, skip_failures: false },
    runtime: { heartbeat_interval_ms: 30000, stale_threshold_ms: 120000 },
    ...overrides,
  };
  writeFileSync(join(miseDir, 'station.yaml'), stringifyYaml(station), 'utf-8');
}

export function createBoard(miseDir: string, tasks: Board['tasks']): Board {
  const board: Board = { version: 1, tasks };
  writeFileSync(join(miseDir, 'board.yaml'), stringifyYaml(board, { lineWidth: 120 }), 'utf-8');

  // Create status files for each task
  for (const task of tasks) {
    writeFileSync(
      join(miseDir, 'status', `${task.id}.yaml`),
      stringifyYaml({
        task_id: task.id,
        status: task.status ?? 'pending',
        updated_at: new Date().toISOString(),
      }),
      'utf-8'
    );
  }

  return board;
}

export function makeTask(id: string, overrides?: Partial<Board['tasks'][0]>): Board['tasks'][0] {
  return {
    id,
    title: `Task ${id}`,
    group: 1,
    depends_on: [],
    size: 'M',
    parallel_safe: false,
    owned_paths: [],
    acceptance_criteria: ['It works'],
    required_inputs: { env_vars: [], services: [], credentials: [], migrations: [] },
    blocking_questions: [],
    assumptions: [],
    status: 'pending',
    ...overrides,
  };
}

export function cleanupDir(dir: string): void {
  try {
    const { rmSync } = require('node:fs');
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures
  }
}
