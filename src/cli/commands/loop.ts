import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import * as output from '../../utils/output.js';
import { getMiseDir, isInitialized, loadStation } from '../../utils/config.js';
import { createEngine } from '../../engines/claude.js';
import { loadBoard, getReadyTasks } from '../../core/board.js';
import { refreshIfNeeded } from '../../core/toc.js';
import { acquire, release, startHeartbeat, recoverStale, isStale } from '../../core/lock.js';
import { createContext, installHandlers, type SignalContext } from '../../core/signals.js';
import { regenerate as regenerateBrief } from '../../core/brief.js';
import { totalCost } from '../../core/progress.js';
import { gate } from '../../core/readiness.js';
import { executeTask } from './run.js';
import { nextBatch } from '../../parallel/scheduler.js';
import { dispatchBatch } from '../../parallel/dispatch.js';
import { mergeGroup } from '../../parallel/merge.js';
import type { Task } from '../../types/board.js';

export interface LoopOptions {
  verbose?: boolean;
  skipFailures?: boolean;
  maxRetries?: string;
}

export async function loopCommand(opts: LoopOptions): Promise<void> {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    output.error('Not a mise project. Run `mise init` first.');
    process.exit(1);
  }

  const miseDir = getMiseDir(projectDir);
  const station = loadStation(projectDir);
  const maxRetries = parseInt(opts.maxRetries ?? String(station.mode.max_retries), 10);
  const skipFailures = opts.skipFailures ?? station.mode.skip_failures;

  // Engine preflight
  const engine = createEngine(station.engine.name);
  const engineAvailable = await engine.check();
  if (!engineAvailable) {
    output.error('Claude CLI not available. Install it first.');
    process.exit(1);
  }

  // Refresh TOC if drifted
  if (refreshIfNeeded(miseDir, projectDir)) {
    output.info('TOC refreshed (drift detected).');
  }

  // Handle stale lock
  if (isStale(miseDir, station.runtime.stale_threshold_ms)) {
    output.warn('Stale lock detected. Recovering...');
    recoverStale(miseDir);
  }

  // Acquire lock
  if (!acquire(miseDir)) {
    output.error('Another mise process is already running. Use `mise status` to check.');
    process.exit(1);
  }

  // Start heartbeat
  const heartbeat = startHeartbeat(miseDir, station.runtime.heartbeat_interval_ms);

  // Install signal handlers
  const ctx = createContext(miseDir);
  ctx.heartbeatInterval = heartbeat;
  installHandlers(ctx);

  const runId = randomUUID();
  let completedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  output.header('Mise Loop');
  output.info(`Run ID: ${runId}`);

  try {
    while (!ctx.shutdownRequested) {
      let board = loadBoard(miseDir);
      const readyTasks = getReadyTasks(miseDir, board);

      if (readyTasks.length === 0) {
        break;
      }

      // Readiness gate
      const { ready, blocked } = gate(miseDir, readyTasks);
      for (const { task, missing } of blocked) {
        output.warn(`Task ${task.id} blocked: ${missing.join(', ')}`);
      }

      if (ready.length === 0) {
        output.warn('All ready tasks are blocked by missing inputs.');
        break;
      }

      // Get batch from scheduler (pass readiness-filtered list)
      const batch = nextBatch(miseDir, board, station.mode.parallel, station.mode.max_parallel, ready);

      if (batch.length > 1) {
        // Parallel execution
        output.info(`Running ${batch.length} tasks in parallel...`);
        const results = await dispatchBatch(projectDir, miseDir, station, batch, runId, maxRetries, opts.verbose, ctx);

        let shouldStop = false;
        for (const result of results) {
          if (result.success) {
            completedCount++;
          } else {
            failedCount++;
            if (!skipFailures) {
              output.error(`Task failed. Stopping loop.`);
              shouldStop = true;
              break;
            }
          }
        }

        // Merge parallel branches
        if (results.some((r) => r.success)) {
          const successTasks = batch.filter((_, i) => results[i].success);
          const mergeResult = await mergeGroup(projectDir, miseDir, successTasks);
          if (!mergeResult.success) {
            output.warn('Merge conflicts detected. Some tasks may need re-execution.');
          }
          regenerateBrief(miseDir);
        }

        if (shouldStop) break;
      } else {
        // Single task execution
        const task = batch[0];
        output.info(`Running task ${task.id}: ${task.title}`);

        // Handle clarification for attended mode
        const clarificationPath = join(miseDir, 'clarifications', `${task.id}.md`);
        let clarifications: string | undefined;

        const result = await executeTask(
          projectDir,
          miseDir,
          station,
          board,
          task,
          runId,
          1,
          maxRetries,
          opts.verbose,
          clarifications,
          ctx
        );

        if (result.success) {
          completedCount++;
          regenerateBrief(miseDir);
        } else if (result.error === 'clarification_needed' && station.mode.attended) {
          // Handle clarification
          if (existsSync(clarificationPath)) {
            const question = readFileSync(clarificationPath, 'utf-8');
            output.header('Clarification Needed');
            console.log(question);
            const answer = await output.ask('Your answer:');
            // Remove clarification file so re-execution doesn't block on it again
            unlinkSync(clarificationPath);
            // Re-execute with clarification
            const retryResult = await executeTask(
              projectDir,
              miseDir,
              station,
              loadBoard(miseDir),
              task,
              runId,
              1,
              maxRetries,
              opts.verbose,
              `Previous question: ${question}\nAnswer: ${answer}`,
              ctx
            );
            if (retryResult.success) {
              completedCount++;
              regenerateBrief(miseDir);
            } else {
              failedCount++;
              if (!skipFailures) break;
            }
          }
        } else {
          failedCount++;
          if (!skipFailures) {
            output.error(`Task ${task.id} failed. Stopping loop.`);
            break;
          }
          skippedCount++;
          output.warn(`Task ${task.id} failed. Skipping (--skip-failures).`);
        }
      }
    }
  } finally {
    // Cleanup
    clearInterval(heartbeat);
    release(miseDir);
  }

  // Summary
  console.log('');
  output.header('Summary');
  output.info(`Completed: ${completedCount}`);
  if (failedCount > 0) output.warn(`Failed: ${failedCount}`);
  if (skippedCount > 0) output.info(`Skipped: ${skippedCount}`);
  const cost = totalCost(miseDir);
  if (cost > 0) output.info(`Total cost: $${cost.toFixed(4)}`);

  if (ctx.shutdownRequested) {
    output.warn('Loop interrupted by signal.');
  } else if (failedCount === 0) {
    output.ok('All tasks completed successfully.');
  }
}
