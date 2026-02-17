import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Station } from '../types/station.js';

export interface BackpressureResult {
  command: string;
  name: string;
  passed: boolean;
  output: string;
}

export function runAll(projectDir: string, miseDir: string, taskId: string, station: Station): { passed: boolean; results: BackpressureResult[] } {
  const bp = station.backpressure;
  const results: BackpressureResult[] = [];
  const logDir = join(miseDir, 'logs', taskId);
  mkdirSync(logDir, { recursive: true });

  for (const [name, cmd] of Object.entries(bp)) {
    if (!cmd) continue;
    let output = '';
    let passed = false;
    try {
      output = execSync(cmd, { cwd: projectDir, timeout: 300000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      passed = true;
    } catch (err: any) {
      output = (err.stdout ?? '') + '\n' + (err.stderr ?? '');
      passed = false;
    }
    writeFileSync(join(logDir, `${name}.log`), output, 'utf-8');
    results.push({ command: cmd, name, passed, output });
  }

  return { passed: results.every(r => r.passed), results };
}
