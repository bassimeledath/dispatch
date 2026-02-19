import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import * as output from '../../utils/output.js';
import { getMiseDir, generateId, addTask, getAllTasks } from '../../core/state.js';
import type { Tier } from '../../types/state.js';

export interface DispatchOptions {
  tier?: string;
  model?: string;
  engine?: string;
}

export async function dispatchCommand(description: string, opts: DispatchOptions): Promise<void> {
  const projectDir = process.cwd();
  const miseDir = getMiseDir(projectDir);
  const tier = (opts.tier ?? 's1') as Tier;

  const validTiers: Tier[] = ['quick', 's1', 's2'];
  if (!validTiers.includes(tier)) {
    output.error(`Invalid tier: ${tier}. Must be quick, s1, or s2.`);
    process.exit(1);
  }

  if (tier === 'quick') {
    const tasks = getAllTasks(miseDir);
    const runningQuick = tasks.find((t) => t.tier === 'quick' && t.status === 'running');
    if (runningQuick) {
      output.warn(`A quick task is already running (${runningQuick.id}). Try again shortly.`);
      process.exit(1);
    }
  }

  const id = generateId();
  mkdirSync(miseDir, { recursive: true });
  addTask(miseDir, id, description, tier, opts.model, opts.engine);

  const child = spawn('manager', ['_worker', id], {
    detached: true,
    stdio: 'ignore',
    cwd: projectDir,
  });
  child.unref();

  output.ok(`[${tier}] ${id}: ${description}`);
  output.dim(`manager log ${id}`);
}
