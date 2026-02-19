import type { ChildProcess } from 'node:child_process';

export interface SignalContext {
  shutdownRequested: boolean;
  activeChild: ChildProcess | null;
  onCleanup?: () => void;
}

export function createContext(): SignalContext {
  return {
    shutdownRequested: false,
    activeChild: null,
  };
}

export function installHandlers(ctx: SignalContext): void {
  const handler = (signal: string) => {
    if (ctx.shutdownRequested) {
      if (ctx.activeChild && !ctx.activeChild.killed) {
        ctx.activeChild.kill('SIGKILL');
      }
      process.exit(1);
    }

    ctx.shutdownRequested = true;

    if (ctx.activeChild && !ctx.activeChild.killed) {
      ctx.activeChild.kill('SIGTERM');
      setTimeout(() => {
        if (ctx.activeChild && !ctx.activeChild.killed) {
          ctx.activeChild.kill('SIGKILL');
        }
      }, 5000);
    }

    ctx.onCleanup?.();
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}
