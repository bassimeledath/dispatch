import type { ChildProcess } from 'node:child_process';
import { logInterrupt } from './progress.js';
import { release } from './lock.js';

export interface SignalContext {
  miseDir: string;
  shutdownRequested: boolean;
  activeChild: ChildProcess | null;
  activeTaskId: string | null;
  heartbeatInterval: NodeJS.Timeout | null;
  onCleanup?: () => void;
}

export function createContext(miseDir: string): SignalContext {
  return {
    miseDir,
    shutdownRequested: false,
    activeChild: null,
    activeTaskId: null,
    heartbeatInterval: null,
  };
}

export function installHandlers(ctx: SignalContext): void {
  const handler = async (signal: string) => {
    if (ctx.shutdownRequested) {
      // Second signal: force kill
      if (ctx.activeChild && !ctx.activeChild.killed) {
        ctx.activeChild.kill('SIGKILL');
      }
      process.exit(1);
    }

    ctx.shutdownRequested = true;

    // Kill child process gracefully
    if (ctx.activeChild && !ctx.activeChild.killed) {
      ctx.activeChild.kill('SIGTERM');
      // Wait 5s then force kill
      setTimeout(() => {
        if (ctx.activeChild && !ctx.activeChild.killed) {
          ctx.activeChild.kill('SIGKILL');
        }
      }, 5000);
    }

    // Log interruption
    if (ctx.activeTaskId) {
      logInterrupt(ctx.miseDir, ctx.activeTaskId, `Interrupted by ${signal}`);
    }

    // Stop heartbeat
    if (ctx.heartbeatInterval) {
      clearInterval(ctx.heartbeatInterval);
    }

    // Release lock
    release(ctx.miseDir);

    // Custom cleanup
    ctx.onCleanup?.();
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}
