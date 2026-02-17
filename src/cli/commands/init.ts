import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { stringify as stringifyYaml } from 'yaml';
import * as output from '../../utils/output.js';
import { detect } from '../../utils/detect.js';
import { getMiseDir, isInitialized, loadStation } from '../../utils/config.js';
import { createEngine } from '../../engines/claude.js';
import { writeToc } from '../../core/toc.js';
import type { Station } from '../../types/station.js';

export interface InitOptions {
  verbose?: boolean;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const projectDir = process.cwd();
  const miseDir = getMiseDir(projectDir);

  output.header('Initializing Mise');

  // Check if already initialized
  if (isInitialized(projectDir)) {
    output.warn('Mise is already initialized in this project.');
    const proceed = await output.confirm('Reinitialize?', false);
    if (!proceed) {
      output.info('Aborted.');
      return;
    }
  }

  // Run detection
  output.info('Detecting project...');
  const detected = detect(projectDir);
  output.ok(`Project: ${detected.name}`);
  if (detected.language) output.ok(`Language: ${detected.language}`);
  if (detected.framework) output.ok(`Framework: ${detected.framework}`);
  if (detected.packageManager) output.ok(`Package manager: ${detected.packageManager}`);

  // Create directory structure
  const dirs = ['status', 'clarifications', 'logs', 'evidence'];
  for (const dir of dirs) {
    mkdirSync(join(miseDir, dir), { recursive: true });
  }
  output.ok('Created .mise/ directory structure');

  // Generate station.yaml
  const station: Station = {
    project: {
      name: detected.name,
      language: detected.language ?? undefined,
      framework: detected.framework ?? undefined,
      package_manager: detected.packageManager ?? undefined,
    },
    backpressure: {
      test: detected.backpressure.test ?? undefined,
      lint: detected.backpressure.lint ?? undefined,
      build: detected.backpressure.build ?? undefined,
      typecheck: detected.backpressure.typecheck ?? undefined,
    },
    rules: [],
    boundaries: [],
    engine: {
      name: 'claude',
      model: 'sonnet',
      max_budget_usd: undefined,
      allowed_tools: [],
    },
    mode: {
      attended: true,
      parallel: 'off',
      max_parallel: 4,
      max_retries: 2,
      skip_failures: false,
    },
    runtime: {
      heartbeat_interval_ms: 30000,
      stale_threshold_ms: 120000,
    },
  };

  const stationPath = join(miseDir, 'station.yaml');
  writeFileSync(stationPath, stringifyYaml(station, { lineWidth: 120 }), 'utf-8');
  output.ok('Generated station.yaml');

  // Validate backpressure commands
  output.info('Verifying backpressure commands...');
  const bp = detected.backpressure;
  for (const [name, cmd] of Object.entries(bp)) {
    if (!cmd) {
      output.dim(`${name}: not detected`);
      continue;
    }
    try {
      execSync(cmd, { cwd: projectDir, stdio: 'ignore', timeout: 30000 });
      output.ok(`${name}: \`${cmd}\` verified`);
    } catch {
      output.warn(`${name}: \`${cmd}\` failed (may need setup)`);
    }
  }

  // Check engine availability
  output.info('Checking engine...');
  const engine = createEngine('claude');
  const available = await engine.check();
  if (available) {
    output.ok('Claude CLI available');
  } else {
    output.warn('Claude CLI not found. Install it before running tasks.');
  }

  // Generate TOC
  output.info('Generating table of contents...');
  writeToc(miseDir, projectDir);
  output.ok('TOC generated');

  // Update .gitignore
  const gitignorePath = join(projectDir, '.gitignore');
  const miseIgnore = readFileSync(
    join(findTemplatesDir(), 'gitignore.mise'),
    'utf-8'
  );

  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf-8');
    if (!existing.includes('.mise/status/')) {
      appendFileSync(gitignorePath, '\n' + miseIgnore, 'utf-8');
      output.ok('Updated .gitignore');
    }
  } else {
    writeFileSync(gitignorePath, miseIgnore, 'utf-8');
    output.ok('Created .gitignore');
  }

  console.log('');
  output.ok('Mise initialized! Next: run `mise prep "your task"` to plan.');
}

function findTemplatesDir(): string {
  // Check various paths relative to this file
  const candidates = [
    join(import.meta.dirname ?? '', '..', '..', '..', 'templates'),
    join(import.meta.dirname ?? '', '..', '..', 'templates'),
    join(process.cwd(), 'templates'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'gitignore.mise'))) return dir;
  }
  throw new Error('Could not find templates directory');
}
