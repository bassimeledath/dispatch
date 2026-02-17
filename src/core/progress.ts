import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface ProgressEntry {
  taskId: string;
  status: string;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
}

function logPath(miseDir: string): string {
  return join(miseDir, 'progress.log');
}

export function logEntry(miseDir: string, entry: ProgressEntry): void {
  const p = logPath(miseDir);
  mkdirSync(dirname(p), { recursive: true });
  const tokensIn = entry.tokensIn ?? 'unknown';
  const tokensOut = entry.tokensOut ?? 'unknown';
  const cost = entry.cost != null ? `$${entry.cost.toFixed(4)}` : 'unknown';
  const duration = `${(entry.durationMs / 1000).toFixed(1)}s`;
  const line = `[${new Date().toISOString()}] ${entry.taskId} | ${entry.status} | ${duration} | ${tokensIn} / ${tokensOut} | ${cost}\n`;
  appendFileSync(p, line, 'utf-8');
}

export function logInterrupt(miseDir: string, taskId: string, reason: string): void {
  const p = logPath(miseDir);
  mkdirSync(dirname(p), { recursive: true });
  const line = `[${new Date().toISOString()}] ${taskId} | interrupted | ${reason}\n`;
  appendFileSync(p, line, 'utf-8');
}

export function totalCost(miseDir: string): number {
  const p = logPath(miseDir);
  if (!existsSync(p)) return 0;
  const lines = readFileSync(p, 'utf-8').trim().split('\n');
  let total = 0;
  for (const line of lines) {
    const match = line.match(/\$(\d+\.?\d*)\s*$/);
    if (match) {
      total += parseFloat(match[1]);
    }
  }
  return total;
}

export function recentEntries(miseDir: string, n: number): string[] {
  const p = logPath(miseDir);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.slice(-n);
}
