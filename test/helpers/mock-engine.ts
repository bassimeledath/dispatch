import type { Engine, EngineResult, EngineRunOptions, TokenUsage } from '../../src/engines/types.js';

export interface MockEngineOptions {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  tokens?: TokenUsage;
  createFiles?: Record<string, string>;
  onRun?: (prompt: string, opts: EngineRunOptions) => void;
}

export class MockEngine implements Engine {
  name = 'mock';
  calls: { prompt: string; opts: EngineRunOptions }[] = [];
  private options: MockEngineOptions;

  constructor(options: MockEngineOptions = {}) {
    this.options = options;
  }

  async check(): Promise<boolean> {
    return true;
  }

  async run(prompt: string, opts: EngineRunOptions): Promise<EngineResult> {
    this.calls.push({ prompt, opts });
    this.options.onRun?.(prompt, opts);

    // Create files if configured
    if (this.options.createFiles) {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join, dirname } = await import('node:path');
      for (const [path, content] of Object.entries(this.options.createFiles)) {
        const fullPath = join(opts.cwd, path);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
      }
    }

    return {
      exitCode: this.options.exitCode ?? 0,
      stdout: this.options.stdout ?? '',
      stderr: this.options.stderr ?? '',
      tokens: this.options.tokens,
    };
  }
}
