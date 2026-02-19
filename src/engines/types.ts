export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost?: number;
}

export interface EngineRunOptions {
  cwd: string;
  allowedTools?: string[];
  model?: string;
  systemPrompt?: string;
  maxBudgetUsd?: number;
  verbose?: boolean;
  maxTurns?: number;
  jsonSchema?: object;
  onChildSpawned?: (child: import('node:child_process').ChildProcess) => void;
}

export interface EngineResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  tokens?: TokenUsage;
  structuredOutput?: unknown;
}

export interface Engine {
  name: string;
  check(): Promise<boolean>;
  run(prompt: string, opts: EngineRunOptions): Promise<EngineResult>;
}
