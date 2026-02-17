import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { BoardSchema, type Board, type Task } from '../types/board.js';
import {
  StatusFileSchema,
  type StatusFile,
  TaskStatus,
  isValidTransition,
} from '../types/status.js';

export function loadBoard(miseDir: string): Board {
  const boardPath = join(miseDir, 'board.yaml');
  if (!existsSync(boardPath)) {
    throw new Error(`No board.yaml found at ${boardPath}. Run \`mise prep\` first.`);
  }
  const raw = readFileSync(boardPath, 'utf-8');
  const data = parseYaml(raw);
  return BoardSchema.parse(data);
}

export function saveBoard(miseDir: string, board: Board): void {
  const boardPath = join(miseDir, 'board.yaml');
  const tmpPath = boardPath + '.tmp';
  const content = stringifyYaml(board, { lineWidth: 120 });
  mkdirSync(dirname(boardPath), { recursive: true });
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, boardPath);
}

export function listTasks(board: Board): Task[] {
  return board.tasks;
}

export function getTask(board: Board, id: string): Task | undefined {
  return board.tasks.find((t) => t.id === id);
}

export function getGroups(board: Board): number[] {
  const groups = new Set(board.tasks.map((t) => t.group));
  return [...groups].sort((a, b) => a - b);
}

export function getGroupTasks(board: Board, group: number): Task[] {
  return board.tasks.filter((t) => t.group === group);
}

export function readStatus(miseDir: string, taskId: string): StatusFile | null {
  const statusPath = join(miseDir, 'status', `${taskId}.yaml`);
  if (!existsSync(statusPath)) return null;
  const raw = readFileSync(statusPath, 'utf-8');
  const data = parseYaml(raw);
  return StatusFileSchema.parse(data);
}

export function writeStatus(miseDir: string, taskId: string, data: StatusFile): void {
  const statusDir = join(miseDir, 'status');
  mkdirSync(statusDir, { recursive: true });
  const statusPath = join(statusDir, `${taskId}.yaml`);
  const tmpPath = statusPath + '.tmp';
  writeFileSync(tmpPath, stringifyYaml(data), 'utf-8');
  renameSync(tmpPath, statusPath);
}

export function getTaskStatus(miseDir: string, taskId: string): string {
  const sf = readStatus(miseDir, taskId);
  return sf?.status ?? TaskStatus.PENDING;
}

export function transition(
  miseDir: string,
  taskId: string,
  from: string,
  to: string,
  extra?: Partial<StatusFile>
): void {
  if (!isValidTransition(from as any, to as any)) {
    throw new Error(`Invalid status transition: ${from} -> ${to} for task ${taskId}`);
  }
  const existing = readStatus(miseDir, taskId);
  const data: StatusFile = {
    task_id: taskId,
    status: to as any,
    updated_at: new Date().toISOString(),
    run_id: existing?.run_id,
    attempt: existing?.attempt,
    ...extra,
  };
  writeStatus(miseDir, taskId, data);
}

export function setTaskStatus(
  miseDir: string,
  board: Board,
  taskId: string,
  status: string,
  extra?: Partial<StatusFile>
): Board {
  const currentStatus = getTaskStatus(miseDir, taskId);
  transition(miseDir, taskId, currentStatus, status, extra);

  // Also update the in-memory board
  const updated = {
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId ? { ...t, status: status as any } : t
    ),
  };
  saveBoard(miseDir, updated);
  return updated;
}

export function getReadyTasks(miseDir: string, board: Board): Task[] {
  return board.tasks.filter((task) => {
    const status = getTaskStatus(miseDir, task.id);
    if (status !== TaskStatus.PENDING) return false;
    // All deps must be complete
    return task.depends_on.every((dep) => {
      const depStatus = getTaskStatus(miseDir, dep);
      return depStatus === TaskStatus.COMPLETE;
    });
  });
}
