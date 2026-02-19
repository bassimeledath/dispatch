import { spawn } from 'node:child_process';
import type { Engine, EngineResult, EngineRunOptions, TokenUsage } from './types.js';
import { CursorEngine } from './cursor.js';

export class ClaudeEngine implements Engine {
  name = 'claude';

  /** Build a clean env that allows spawning claude without nesting errors. */
  private cleanEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    // Remove vars that cause "nested session" detection
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDECODE;
    return env;
  }

  async check(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('claude', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.cleanEnv(),
      });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  async run(prompt: string, opts: EngineRunOptions): Promise<EngineResult> {
    const args: string[] = ['-p', '--verbose', '--output-format', 'stream-json'];

    if (opts.allowedTools && opts.allowedTools.length > 0) {
      args.push('--allowedTools', ...opts.allowedTools);
    }
    if (opts.model) {
      args.push('--model', opts.model);
    }
    if (opts.systemPrompt) {
      args.push('--system-prompt', opts.systemPrompt);
    }
    if (opts.maxBudgetUsd) {
      args.push('--max-budget-usd', String(opts.maxBudgetUsd));
    }
    if (opts.maxTurns) {
      args.push('--max-turns', String(opts.maxTurns));
    }
    if (opts.jsonSchema) {
      args.push('--json-schema', JSON.stringify(opts.jsonSchema));
    }

    args.push('--dangerously-skip-permissions');

    return new Promise((resolve, reject) => {
      const child = spawn('claude', args, {
        cwd: opts.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.cleanEnv(),
      });

      opts.onChildSpawned?.(child);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        if (opts.verbose) {
          process.stdout.write(chunk);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        if (opts.verbose) {
          process.stderr.write(chunk);
        }
      });

      // Send prompt via stdin
      child.stdin.write(prompt);
      child.stdin.end();

      child.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        const tokens = this.parseTokens(stdout);
        const structuredOutput = this.parseStructuredOutput(stdout);

        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          tokens: tokens ?? undefined,
          structuredOutput: structuredOutput ?? undefined,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });
    });
  }

  parseTokens(output: string): TokenUsage | null {
    try {
      // stream-json output: each line is a JSON object
      // Look for the final result message that has usage info
      const lines = output.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.type === 'result' && parsed.usage) {
            return {
              inputTokens: parsed.usage.input_tokens ?? 0,
              outputTokens: parsed.usage.output_tokens ?? 0,
              cost: parsed.cost_usd ?? undefined,
            };
          }
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  parseStructuredOutput(output: string): unknown {
    try {
      const lines = output.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.type === 'result' && parsed.structured_output != null) {
            return parsed.structured_output;
          }
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

export function createEngine(name: string): Engine {
  if (name === 'cursor') return new CursorEngine();
  return new ClaudeEngine();
}
