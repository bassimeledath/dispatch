import { mkdirSync, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { WriteStream } from 'node:fs';
import { createEngine } from '../engines/claude.js';
import type { Engine } from '../engines/types.js';
import * as state from './state.js';
import { notifyComplete, notifyError, notifyQuestion } from './notify.js';
import { loadTemplate, interpolate } from '../utils/prompt.js';
import * as worktree from '../parallel/worktree.js';
import type { Task } from '../types/state.js';
import { runLint } from './lint.js';

const REVIEWER_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['approve', 'revise'] },
    feedback: { type: 'string' },
  },
  required: ['decision', 'feedback'],
};

function loadPrefs(): string {
  const prefsPath = join(homedir(), '.manager', 'prefs.md');
  if (existsSync(prefsPath)) {
    return readFileSync(prefsPath, 'utf-8');
  }
  return 'No preferences set.';
}

function parseQuestionMarker(output: string): string | null {
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"type"') && trimmed.includes('"question"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === 'question' && typeof parsed.question === 'string') {
          return parsed.question;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

function parseReviewerMarker(output: string): { type: 'approve' | 'revise'; feedback?: string } | null {
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"type"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === 'approve' || parsed.type === 'revise') {
          return parsed;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

function log(logStream: WriteStream, text: string): void {
  logStream.write(text + '\n');
}

async function runEngineWithLogging(
  engine: Engine,
  prompt: string,
  cwd: string,
  model: string,
  logStream: WriteStream,
  label = '',
  extraOpts: { jsonSchema?: object } = {}
): Promise<{ stdout: string; exitCode: number; structuredOutput?: unknown }> {
  const prefix = label ? `[${label}] ` : '';
  log(logStream, `\n${prefix}[${new Date().toISOString()}] Running ${engine.name} (${model})...`);

  const result = await engine.run(prompt, {
    cwd,
    model,
    verbose: false,
    maxTurns: 30,
    ...extraOpts,
    onChildSpawned: (child) => {
      child.stdout?.on('data', (chunk: Buffer) => logStream.write(chunk));
      child.stderr?.on('data', (chunk: Buffer) => logStream.write(chunk));
    },
  });

  log(logStream, `\n${prefix}[${new Date().toISOString()}] Exit code: ${result.exitCode}`);
  return { stdout: result.stdout, exitCode: result.exitCode, structuredOutput: result.structuredOutput };
}

async function runWithQuestionLoop(
  engine: Engine,
  initialPrompt: string,
  cwd: string,
  model: string,
  miseDir: string,
  taskId: string,
  logStream: WriteStream,
  maxQuestions = 5
): Promise<string> {
  let prompt = initialPrompt;
  let questionCount = 0;

  while (questionCount <= maxQuestions) {
    const { stdout, exitCode } = await runEngineWithLogging(engine, prompt, cwd, model, logStream);

    const question = parseQuestionMarker(stdout);
    if (question) {
      questionCount++;
      log(logStream, `[question] ${question}`);
      state.setQuestion(miseDir, taskId, question);
      notifyQuestion(taskId, question);

      const answer = await state.pollAnswer(miseDir, taskId);
      if (!answer) {
        throw new Error('Timed out waiting for user input (1 hour)');
      }

      state.updateTask(miseDir, taskId, { question: null, answer: null, status: 'running' });
      prompt =
        prompt +
        `\n\n---\nYou previously asked: ${question}\nUser answered: ${answer}\n---\nPlease continue with the task using this information.`;
      continue;
    }

    if (exitCode !== 0) {
      throw new Error(`${engine.name} exited with code ${exitCode}`);
    }

    return stdout;
  }

  throw new Error('Max question retries exceeded');
}

async function applyLintStep(
  engine: Engine,
  initialPrompt: string,
  cwd: string,
  model: string,
  projectDir: string,
  miseDir: string,
  taskId: string,
  logStream: WriteStream
): Promise<boolean> {
  const lintResult = runLint(cwd, projectDir);
  state.updateTask(miseDir, taskId, { lintPassed: lintResult.passed });

  if (!lintResult.passed && lintResult.output) {
    log(logStream, `Lint failed:\n${lintResult.output}`);
    const fixPrompt =
      initialPrompt +
      `\n\n---\nLinting failed. Fix these errors:\n\`\`\`\n${lintResult.output}\n\`\`\`\nStage your fixes.`;
    await runEngineWithLogging(engine, fixPrompt, cwd, model, logStream, 'lint-fix');
  }

  return lintResult.passed;
}

function createGhPR(cwd: string, title: string, body: string, branch: string): string | null {
  const result = spawnSync('gh', ['pr', 'create', '--title', title, '--body', body, '--head', branch], {
    cwd,
    encoding: 'utf-8',
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function getBaseSha(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  return result.stdout.trim();
}

function getGitDiff(cwd: string, baseSha: string): string {
  const result = spawnSync('git', ['diff', baseSha, 'HEAD'], { cwd, encoding: 'utf-8' });
  return result.stdout || '(no diff)';
}

export async function runWorker(taskId: string): Promise<void> {
  const projectDir = process.cwd();
  const miseDir = state.getMiseDir(projectDir);

  const task = state.getTask(miseDir, taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found in state`);
  }

  const logDir = join(miseDir, 'tasks', taskId);
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, 'log.txt');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  try {
    log(logStream, `[${new Date().toISOString()}] Worker started: ${taskId} (${task.tier})`);
    log(logStream, `Description: ${task.description}`);
    log(logStream, `Engine: ${task.engine}, Model: ${task.model}`);

    state.updateTask(miseDir, taskId, { status: 'running', pid: process.pid });

    if (task.tier === 'quick') {
      await runQuickWorker(task, projectDir, miseDir, logStream);
    } else if (task.tier === 's1') {
      await runS1Worker(task, projectDir, miseDir, logStream);
    } else {
      await runS2Worker(task, projectDir, miseDir, logStream);
    }

    notifyComplete(taskId, task.description);
    log(logStream, `[${new Date().toISOString()}] Task complete`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(logStream, `[${new Date().toISOString()}] ERROR: ${message}`);
    state.updateTask(miseDir, taskId, { status: 'failed', error: message });
    notifyError(taskId, message);
  } finally {
    logStream.end();
  }
}

async function runQuickWorker(
  task: Task,
  projectDir: string,
  miseDir: string,
  logStream: WriteStream
): Promise<void> {
  const engine = createEngine(task.engine);
  const prefs = loadPrefs();
  const template = loadTemplate('quick-worker');
  const prompt = interpolate(template, { description: task.description, prefs });

  await runWithQuestionLoop(engine, prompt, projectDir, task.model, miseDir, task.id, logStream);

  // Check for staged changes
  const stagedResult = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd: projectDir,
    encoding: 'utf-8',
  });
  const staged = stagedResult.stdout.trim();

  if (staged) {
    const commitResult = spawnSync(
      'git',
      ['commit', '-m', `manager(${task.id}): ${task.description.slice(0, 72)}`],
      { cwd: projectDir, encoding: 'utf-8' }
    );
    if (commitResult.status !== 0) {
      throw new Error(`Commit failed: ${commitResult.stderr}`);
    }
    const shaResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf-8' });
    state.updateTask(miseDir, task.id, { status: 'complete', commit: shaResult.stdout.trim() });
    log(logStream, `Committed: ${shaResult.stdout.trim()}`);
  } else {
    log(logStream, 'No staged changes to commit.');
    state.updateTask(miseDir, task.id, { status: 'complete' });
  }
}

async function runS1Worker(
  task: Task,
  projectDir: string,
  miseDir: string,
  logStream: WriteStream
): Promise<void> {
  const engine = createEngine(task.engine);
  const prefs = loadPrefs();

  const wtPath = await worktree.create(projectDir, miseDir, task.id);
  const branch = `manager/task-${task.id}`;
  log(logStream, `Worktree: ${wtPath}`);
  state.updateTask(miseDir, task.id, { worktree: wtPath, branch });

  try {
    const template = loadTemplate('s1-worker');
    const prompt = interpolate(template, { description: task.description, prefs });

    await runWithQuestionLoop(engine, prompt, wtPath, task.model, miseDir, task.id, logStream);

    // Lint step after implementation
    await applyLintStep(engine, prompt, wtPath, task.model, projectDir, miseDir, task.id, logStream);

    // Stage everything in case worker forgot to stage some files
    spawnSync('git', ['add', '-A'], { cwd: wtPath });

    const hasStagedResult = spawnSync('git', ['diff', '--cached', '--name-only'], {
      cwd: wtPath,
      encoding: 'utf-8',
    });
    if (hasStagedResult.stdout.trim()) {
      spawnSync('git', ['commit', '-m', `manager(${task.id}): ${task.description.slice(0, 72)}`], {
        cwd: wtPath,
        encoding: 'utf-8',
      });
    }

    log(logStream, 'Creating PR...');
    const prUrl = createGhPR(
      wtPath,
      task.description.slice(0, 72),
      `Implements: ${task.description}\n\nGenerated by manager (s1/${task.model})`,
      branch
    );

    if (prUrl) {
      log(logStream, `PR: ${prUrl}`);
      state.updateTask(miseDir, task.id, { status: 'complete', pr: prUrl });
    } else {
      log(logStream, 'PR creation failed (gh may not be available). Changes are committed to branch.');
      state.updateTask(miseDir, task.id, { status: 'complete' });
    }
  } finally {
    try {
      await worktree.removeDir(projectDir, miseDir, task.id);
      log(logStream, 'Worktree removed.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(logStream, `Worktree removal failed: ${msg}`);
    }
  }
}

async function runS2Worker(
  task: Task,
  projectDir: string,
  miseDir: string,
  logStream: WriteStream
): Promise<void> {
  const engine = createEngine(task.engine);
  const prefs = loadPrefs();

  const wtPath = await worktree.create(projectDir, miseDir, task.id);
  const branch = `manager/task-${task.id}`;
  log(logStream, `Worktree: ${wtPath}`);
  state.updateTask(miseDir, task.id, { worktree: wtPath, branch });

  const baseSha = getBaseSha(wtPath);
  let reviewerFeedback = '';

  try {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        state.updateTask(miseDir, task.id, { retries: attempt });
        log(logStream, `\n--- Retry ${attempt} (reviewer feedback) ---`);
      }

      const seniorTemplate = loadTemplate('s2-senior');
      const seniorPrompt = interpolate(seniorTemplate, {
        description: task.description,
        prefs,
        reviewer_feedback: reviewerFeedback || 'None (first attempt)',
      });

      await runWithQuestionLoop(
        engine,
        seniorPrompt,
        wtPath,
        task.model,
        miseDir,
        task.id,
        logStream,
        5
      );

      // Lint step after each implementation attempt
      await applyLintStep(engine, seniorPrompt, wtPath, task.model, projectDir, miseDir, task.id, logStream);

      // Stage and commit implementation
      spawnSync('git', ['add', '-A'], { cwd: wtPath });
      const hasStagedResult = spawnSync('git', ['diff', '--cached', '--name-only'], {
        cwd: wtPath,
        encoding: 'utf-8',
      });
      if (hasStagedResult.stdout.trim()) {
        spawnSync(
          'git',
          ['commit', '-m', `manager(${task.id}): ${task.description.slice(0, 72)} [attempt ${attempt + 1}]`],
          { cwd: wtPath, encoding: 'utf-8' }
        );
      }

      // Run reviewer
      log(logStream, '\nRunning reviewer...');
      const diff = getGitDiff(wtPath, baseSha);
      const reviewerTemplate = loadTemplate('s2-reviewer');
      const reviewerPrompt = interpolate(reviewerTemplate, {
        description: task.description,
        diff,
      });

      const reviewerModel = task.reviewerModel ?? task.model;
      log(logStream, `Reviewer model: ${reviewerModel}`);
      const reviewResult = await engine.run(reviewerPrompt, {
        cwd: wtPath,
        model: reviewerModel,
        maxTurns: 30,
        jsonSchema: engine.name === 'claude' ? REVIEWER_SCHEMA : undefined,
        verbose: false,
        onChildSpawned: (child) => {
          child.stdout?.on('data', (chunk: Buffer) => logStream.write(chunk));
        },
      });

      // Parse structured output (ClaudeEngine with --json-schema)
      let review: { type: 'approve' | 'revise'; feedback?: string } | null = null;
      if (reviewResult.structuredOutput && typeof reviewResult.structuredOutput === 'object') {
        const so = reviewResult.structuredOutput as Record<string, unknown>;
        if (so.decision === 'approve' || so.decision === 'revise') {
          review = { type: so.decision as 'approve' | 'revise', feedback: so.feedback as string | undefined };
        }
      }
      // Fallback to text-marker parsing (CursorEngine or missing structured output)
      if (!review) {
        review = parseReviewerMarker(reviewResult.stdout);
      }

      if (review?.type === 'approve') {
        log(logStream, `Reviewer approved. ${review.feedback ?? ''}`);
        break;
      } else if (review?.type === 'revise' && attempt < 2) {
        reviewerFeedback = review.feedback ?? 'Reviewer requested revisions.';
        log(logStream, `Reviewer: revise — ${reviewerFeedback}`);
      } else {
        if (review?.feedback) reviewerFeedback = review.feedback;
        log(logStream, 'Max reviewer retries reached. Proceeding with PR.');
        break;
      }
    }

    const prBody = [
      `Implements: ${task.description}`,
      '',
      `Generated by manager (s2/${task.model} + ${task.reviewerModel ?? task.model} reviewer)`,
      reviewerFeedback ? `\n**Reviewer notes:** ${reviewerFeedback}` : '',
    ]
      .join('\n')
      .trim();

    log(logStream, 'Creating PR...');
    const prUrl = createGhPR(wtPath, task.description.slice(0, 72), prBody, branch);

    if (prUrl) {
      log(logStream, `PR: ${prUrl}`);
      state.updateTask(miseDir, task.id, { status: 'complete', pr: prUrl });
    } else {
      log(logStream, 'PR creation failed (gh may not be available). Changes are committed to branch.');
      state.updateTask(miseDir, task.id, { status: 'complete' });
    }
  } finally {
    try {
      await worktree.removeDir(projectDir, miseDir, task.id);
      log(logStream, 'Worktree removed.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(logStream, `Worktree removal failed: ${msg}`);
    }
  }
}

export async function killWorker(taskId: string, pid: number): Promise<void> {
  try {
    process.kill(pid, 0); // throws ESRCH if dead
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already dead
  }
}
