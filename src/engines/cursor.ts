import { spawn } from 'node:child_process';
import type { Engine, EngineResult, EngineRunOptions } from './types.js';

export class CursorEngine implements Engine {
  name = 'cursor';

  async check(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('cursor', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  async run(prompt: string, opts: EngineRunOptions): Promise<EngineResult> {
    // cursor agent -p --output-format stream-json --trust --force [--model x]
    const args: string[] = ['agent', '-p', '--output-format', 'stream-json', '--trust', '--force'];

    if (opts.model) {
      args.push('--model', opts.model);
    }

    return new Promise((resolve, reject) => {
      const child = spawn('cursor', args, {
        cwd: opts.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      opts.onChildSpawned?.(child);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        if (opts.verbose) process.stdout.write(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        if (opts.verbose) process.stderr.write(chunk);
      });

      child.stdin.write(prompt);
      child.stdin.end();

      child.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          // Cursor stream-json format differs; token info not parsed
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn cursor: ${err.message}`));
      });
    });
  }
}
