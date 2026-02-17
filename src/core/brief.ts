import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadBoard, getReadyTasks, readStatus } from './board.js';
import { recentEntries } from './progress.js';
import { TaskStatus } from '../types/status.js';

const DEFAULT_LINE_BUDGET = 150;

export function regenerate(miseDir: string, lineBudget: number = DEFAULT_LINE_BUDGET): void {
  let board;
  try {
    board = loadBoard(miseDir);
  } catch {
    return; // No board yet
  }

  const lines: string[] = ['# Brief', ''];

  // Recent completions
  lines.push('## Recent Completions', '');
  const completed = board.tasks.filter(t => {
    const status = readStatus(miseDir, t.id);
    return status?.status === TaskStatus.COMPLETE;
  });
  if (completed.length === 0) {
    lines.push('_None yet._', '');
  } else {
    for (const task of completed.slice(-10)) {
      lines.push(`- [x] ${task.id}: ${task.title}`);
    }
    lines.push('');
  }

  // Open blockers
  lines.push('## Open Blockers', '');
  const blocked = board.tasks.filter(t => {
    const status = readStatus(miseDir, t.id);
    return status?.status === TaskStatus.BLOCKED;
  });
  if (blocked.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const task of blocked) {
      const sf = readStatus(miseDir, task.id);
      lines.push(`- ${task.id}: ${task.title} — ${sf?.note ?? 'blocked'}`);
    }
    lines.push('');
  }

  // Active assumptions
  lines.push('## Active Assumptions', '');
  const allAssumptions = completed.flatMap(t => t.assumptions.map(a => `${t.id}: ${a}`));
  if (allAssumptions.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const a of allAssumptions.slice(-20)) {
      lines.push(`- ${a}`);
    }
    lines.push('');
  }

  // Next ready tasks
  lines.push('## Next Ready Tasks', '');
  const ready = getReadyTasks(miseDir, board);
  if (ready.length === 0) {
    lines.push('_None. All tasks are complete, blocked, or have unmet dependencies._', '');
  } else {
    for (const task of ready) {
      lines.push(`- [ ] ${task.id}: ${task.title} [${task.size}]`);
    }
    lines.push('');
  }

  // Truncate to line budget, removing oldest completions first
  let content = lines.join('\n');
  const contentLines = content.split('\n');
  if (contentLines.length > lineBudget) {
    // Simple truncation - keep all sections but trim completions
    const excess = contentLines.length - lineBudget;
    const completionStart = contentLines.indexOf('## Recent Completions') + 2;
    const completionEnd = contentLines.indexOf('## Open Blockers');
    const completionLines = completionEnd - completionStart;
    const toRemove = Math.min(excess, completionLines - 1);
    if (toRemove > 0) {
      contentLines.splice(completionStart, toRemove);
    }
    content = contentLines.slice(0, lineBudget).join('\n');
  }

  writeFileSync(join(miseDir, 'brief.md'), content + '\n', 'utf-8');
}
