import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

interface LockData {
  pid: number;
  started_at: string;
  heartbeat_at: string;
}

export function acquire(miseDir: string): boolean {
  const lockPath = join(miseDir, 'run.lock');
  
  if (existsSync(lockPath)) {
    // Check if stale
    if (isStale(miseDir, 120000)) {
      unlinkSync(lockPath);
    } else {
      return false;  // Lock held by another process
    }
  }

  const data: LockData = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  };

  try {
    writeFileSync(lockPath, stringifyYaml(data), { flag: 'wx' });
    return true;
  } catch {
    return false;  // Race condition - another process got the lock
  }
}

export function release(miseDir: string): void {
  const lockPath = join(miseDir, 'run.lock');
  try { unlinkSync(lockPath); } catch { /* ignore */ }
}

export function startHeartbeat(miseDir: string, intervalMs: number = 30000): NodeJS.Timeout {
  return setInterval(() => {
    const lockPath = join(miseDir, 'run.lock');
    if (!existsSync(lockPath)) return;
    try {
      const raw = readFileSync(lockPath, 'utf-8');
      const data = parseYaml(raw) as LockData;
      data.heartbeat_at = new Date().toISOString();
      writeFileSync(lockPath, stringifyYaml(data));
    } catch { /* ignore */ }
  }, intervalMs);
}

export function isStale(miseDir: string, thresholdMs: number = 120000): boolean {
  const lockPath = join(miseDir, 'run.lock');
  if (!existsSync(lockPath)) return false;
  try {
    const raw = readFileSync(lockPath, 'utf-8');
    const data = parseYaml(raw) as LockData;
    const elapsed = Date.now() - new Date(data.heartbeat_at).getTime();
    return elapsed > thresholdMs;
  } catch {
    return true;
  }
}

export function recoverStale(miseDir: string): void {
  // readdirSync is imported at the top
  const statusDir = join(miseDir, 'status');
  if (existsSync(statusDir)) {
    const files = readdirSync(statusDir);
    for (const file of files) {
      const statusPath = join(statusDir, file);
      try {
        const raw = readFileSync(statusPath, 'utf-8');
        const data = parseYaml(raw);
        if (data.status === 'in_progress') {
          data.status = 'pending';
          data.note = 'Reset from stale lock recovery';
          data.updated_at = new Date().toISOString();
          writeFileSync(statusPath, stringifyYaml(data));
        }
      } catch { /* skip bad files */ }
    }
  }
  release(miseDir);
}
