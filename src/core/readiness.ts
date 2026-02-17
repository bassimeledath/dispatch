import { type Task } from '../types/board.js';
import * as output from '../utils/output.js';

export interface ReadinessResult {
  ready: boolean;
  missing: string[];
}

export function checkTask(miseDir: string, task: Task): ReadinessResult {
  const missing: string[] = [];
  const inputs = task.required_inputs;

  // Check env vars
  for (const envVar of inputs.env_vars) {
    if (!process.env[envVar]) {
      missing.push(`Environment variable ${envVar} is not set`);
    }
  }

  // Services - just log as info, we don't do full connectivity checks in sync mode
  for (const service of inputs.services) {
    output.dim(`Service required: ${service} (not verified)`);
  }

  // Credentials - informational
  for (const cred of inputs.credentials) {
    output.dim(`Credential required: ${cred}`);
  }

  // Migrations - informational
  for (const migration of inputs.migrations) {
    output.dim(`Migration required: ${migration}`);
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export function gate(miseDir: string, tasks: Task[]): { ready: Task[]; blocked: { task: Task; missing: string[] }[] } {
  const ready: Task[] = [];
  const blocked: { task: Task; missing: string[] }[] = [];

  for (const task of tasks) {
    const result = checkTask(miseDir, task);
    if (result.ready) {
      ready.push(task);
    } else {
      blocked.push({ task, missing: result.missing });
    }
  }

  return { ready, blocked };
}
