import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as output from '../../utils/output.js';
import { getMiseDir, isInitialized, loadStation } from '../../utils/config.js';
import { createEngine } from '../../engines/claude.js';
import { loadBoard, getReadyTasks, getTask, setTaskStatus } from '../../core/board.js';
import { loadTemplate, interpolate } from '../../utils/prompt.js';
import { readToc } from '../../core/toc.js';
import { runAll as runBackpressure } from '../../core/backpressure.js';
import { logEntry } from '../../core/progress.js';
import { checkTask } from '../../core/readiness.js';
import { TaskStatus } from '../../types/status.js';
import * as git from '../../utils/git.js';
import type { Board, Task } from '../../types/board.js';
import type { Station } from '../../types/station.js';
import type { SignalContext } from '../../core/signals.js';

export interface RunOptions {
  verbose?: boolean;
  task?: string;
  retries?: string;
}

export async function runCommand(opts: RunOptions): Promise<void> {
  const projectDir = process.cwd();
  if (!isInitialized(projectDir)) {
    output.error('Not a mise project. Run `mise init` first.');
    process.exit(1);
  }

  const miseDir = getMiseDir(projectDir);
  const board = loadBoard(miseDir);
  const station = loadStation(projectDir);
  const runId = randomUUID();
  const maxRetries = parseInt(opts.retries ?? '2', 10);

  let task: Task | undefined;
  if (opts.task) {
    task = getTask(board, opts.task);
    if (!task) {
      output.error(`Task not found: ${opts.task}`);
      process.exit(1);
    }
  } else {
    const ready = getReadyTasks(miseDir, board);
    if (ready.length === 0) {
      output.info('No ready tasks. All tasks are complete or have unmet dependencies.');
      return;
    }
    task = ready[0];
  }

  output.header(`Running Task: ${task.id}`);
  output.info(task.title);

  const result = await executeTask(projectDir, miseDir, station, board, task, runId, 1, maxRetries, opts.verbose);
  if (result.success) {
    output.ok(`Task ${task.id} completed.`);
  } else {
    output.error(`Task ${task.id} failed: ${result.error ?? 'unknown error'}`);
    process.exit(1);
  }
}

export interface ExecuteResult {
  success: boolean;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  durationMs: number;
}

export async function executeTask(
  projectDir: string,
  miseDir: string,
  station: Station,
  board: Board,
  task: Task,
  runId: string,
  attempt: number,
  maxRetries: number,
  verbose?: boolean,
  clarifications?: string,
  signalCtx?: SignalContext
): Promise<ExecuteResult> {
  const startTime = Date.now();

  // Readiness check
  const readiness = checkTask(miseDir, task);
  if (!readiness.ready) {
    for (const m of readiness.missing) {
      output.warn(m);
    }
    return { success: false, error: `Missing inputs: ${readiness.missing.join(', ')}`, durationMs: Date.now() - startTime };
  }

  // Transition to in_progress
  setTaskStatus(miseDir, board, task.id, TaskStatus.IN_PROGRESS, {
    run_id: runId,
    attempt,
  });

  // Build the task prompt
  const template = loadTemplate('task');
  const toc = readToc(miseDir);
  const modeInstructions = station.mode.attended
    ? 'You are running in ATTENDED mode. If you have a blocking question, write it to the clarification file and stop.'
    : 'You are running in AUTONOMOUS mode. Make reasonable decisions and proceed without asking questions.';

  const taskPrompt = interpolate(template, {
    PROJECT_NAME: station.project.name,
    LANGUAGE: station.project.language ?? 'unknown',
    FRAMEWORK: station.project.framework ?? 'none',
    TOC: toc || '_No TOC generated._',
    RULES: station.rules.length > 0 ? station.rules.map((r) => `- ${r}`).join('\n') : '_None._',
    BOUNDARIES: station.boundaries.length > 0 ? station.boundaries.map((b) => `- ${b}`).join('\n') : '_None._',
    TASK_ID: task.id,
    TASK_TITLE: task.title,
    ACCEPTANCE_CRITERIA: task.acceptance_criteria.map((c) => `- ${c}`).join('\n') || '_None specified._',
    ASSUMPTIONS: task.assumptions.map((a) => `- ${a}`).join('\n') || '_None._',
    TASK_CLARIFICATIONS: clarifications ?? '_None._',
    MODE_INSTRUCTIONS: modeInstructions,
    OWNED_PATHS: task.owned_paths.join(', ') || '_No restrictions._',
  });

  // Snapshot working tree before execution for targeted staging
  const beforeSnapshot = git.snapshot(projectDir);

  // Run the engine
  const engine = createEngine(station.engine.name);
  const spin = output.spinner(`Executing task ${task.id} (attempt ${attempt})...`);

  // Wire signal context so SIGINT can terminate the child process
  if (signalCtx) {
    signalCtx.activeTaskId = task.id;
  }

  const result = await engine.run(taskPrompt, {
    cwd: projectDir,
    model: station.engine.model,
    allowedTools: station.engine.allowed_tools.length > 0 ? station.engine.allowed_tools : undefined,
    maxBudgetUsd: station.engine.max_budget_usd,
    verbose,
    onChildSpawned: signalCtx ? (child) => { signalCtx.activeChild = child; } : undefined,
  });
  spin.stop();

  // Clear signal context after engine completes
  if (signalCtx) {
    signalCtx.activeChild = null;
    signalCtx.activeTaskId = null;
  }

  const durationMs = Date.now() - startTime;

  if (result.exitCode !== 0) {
    setTaskStatus(miseDir, board, task.id, TaskStatus.FAILED, {
      error: `Engine exited with code ${result.exitCode}`,
      run_id: runId,
      attempt,
    });
    logEntry(miseDir, {
      taskId: task.id,
      status: 'failed',
      durationMs,
      tokensIn: result.tokens?.inputTokens ?? null,
      tokensOut: result.tokens?.outputTokens ?? null,
      cost: result.tokens?.cost ?? null,
    });
    return { success: false, error: `Engine exited with code ${result.exitCode}`, durationMs };
  }

  // Check for clarification (attended mode)
  const clarificationPath = join(miseDir, 'clarifications', `${task.id}.md`);
  if (existsSync(clarificationPath)) {
    const question = readFileSync(clarificationPath, 'utf-8');
    if (question.trim() && station.mode.attended) {
      // Set status to blocked - the loop/caller handles the question
      setTaskStatus(miseDir, board, task.id, TaskStatus.BLOCKED, {
        note: 'Clarification needed',
        run_id: runId,
        attempt,
      });
      return { success: false, error: 'clarification_needed', durationMs };
    }
  }

  // Stage only files changed by this task (not unrelated working tree changes)
  const changed = git.changedFiles(projectDir, beforeSnapshot);
  if (changed.length > 0) {
    await git.stageFiles(projectDir, changed);
    await git.miseCommit(projectDir, task.id, task.title, runId);
    output.ok(`Committed changes for task ${task.id}`);
  }

  // Run backpressure
  output.info('Running backpressure checks...');
  const bpResult = runBackpressure(projectDir, miseDir, task.id, station);
  for (const r of bpResult.results) {
    if (r.passed) {
      output.ok(`${r.name}: passed`);
    } else {
      output.error(`${r.name}: failed`);
    }
  }

  if (!bpResult.passed) {
    if (attempt < maxRetries) {
      output.warn(`Backpressure failed. Retrying (attempt ${attempt + 1}/${maxRetries})...`);
      // Reset to pending for retry
      setTaskStatus(miseDir, board, task.id, TaskStatus.PENDING, {
        note: `Backpressure retry ${attempt + 1}`,
        run_id: runId,
      });
      return executeTask(projectDir, miseDir, station, board, task, runId, attempt + 1, maxRetries, verbose, undefined, signalCtx);
    }
    setTaskStatus(miseDir, board, task.id, TaskStatus.FAILED, {
      error: 'Backpressure failed after all retries',
      run_id: runId,
      attempt,
    });
    logEntry(miseDir, {
      taskId: task.id,
      status: 'failed',
      durationMs,
      tokensIn: result.tokens?.inputTokens ?? null,
      tokensOut: result.tokens?.outputTokens ?? null,
      cost: result.tokens?.cost ?? null,
    });
    return { success: false, error: 'Backpressure failed', durationMs };
  }

  // Check evidence
  const evidencePath = join(miseDir, 'evidence', `${task.id}.md`);
  if (!existsSync(evidencePath)) {
    output.warn(`No evidence file found for task ${task.id}`);
  }

  // Mark complete
  setTaskStatus(miseDir, board, task.id, TaskStatus.COMPLETE, {
    run_id: runId,
    attempt,
  });

  logEntry(miseDir, {
    taskId: task.id,
    status: 'complete',
    durationMs,
    tokensIn: result.tokens?.inputTokens ?? null,
    tokensOut: result.tokens?.outputTokens ?? null,
    cost: result.tokens?.cost ?? null,
  });

  return {
    success: true,
    durationMs,
    tokensIn: result.tokens?.inputTokens,
    tokensOut: result.tokens?.outputTokens,
    cost: result.tokens?.cost,
  };
}
