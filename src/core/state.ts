import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { StateSchema, type State, type Task, type Tier } from '../types/state.js';
import { getConfig } from './config.js';

export function getMiseDir(projectDir: string): string {
  return join(projectDir, '.manager');
}

export function getStatePath(miseDir: string): string {
  return join(miseDir, 'state.json');
}

export function generateId(): string {
  return randomBytes(4).toString('hex');
}

export function readState(miseDir: string): State {
  const path = getStatePath(miseDir);
  if (!existsSync(path)) {
    return { version: 1, tasks: {} };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    return StateSchema.parse(JSON.parse(raw));
  } catch {
    return { version: 1, tasks: {} };
  }
}

export function writeState(miseDir: string, state: State): void {
  const path = getStatePath(miseDir);
  const tmp = path + '.tmp';
  mkdirSync(miseDir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export function addTask(
  miseDir: string,
  id: string,
  description: string,
  tier: Tier,
  modelOverride?: string,
  engineOverride?: string
): Task {
  const config = getConfig();
  const models = config.models;
  const engine = engineOverride ?? config.engine;
  const implementerModel =
    modelOverride ??
    (tier === 'quick' ? models.quick : tier === 's1' ? models.s1 : models.s2);
  const reviewerModel = tier === 's2' ? models.reviewer : null;

  const st = readState(miseDir);
  const now = new Date().toISOString();
  const task: Task = {
    id,
    description,
    tier,
    model: implementerModel,
    reviewerModel,
    engine,
    lintPassed: null,
    status: 'pending',
    created: now,
    updated: now,
    pid: null,
    worktree: null,
    branch: null,
    question: null,
    answer: null,
    pr: null,
    commit: null,
    error: null,
    retries: 0,
  };
  st.tasks[id] = task;
  writeState(miseDir, st);
  return task;
}

export function updateTask(miseDir: string, id: string, updates: Partial<Task>): Task {
  const st = readState(miseDir);
  const task = st.tasks[id];
  if (!task) throw new Error(`Task ${id} not found`);
  const updated = { ...task, ...updates, updated: new Date().toISOString() };
  st.tasks[id] = updated;
  writeState(miseDir, st);
  return updated;
}

export function setQuestion(miseDir: string, id: string, question: string): void {
  updateTask(miseDir, id, { status: 'waiting', question, answer: null });
}

export function setAnswer(miseDir: string, id: string, answer: string): void {
  updateTask(miseDir, id, { answer });
}

export async function pollAnswer(
  miseDir: string,
  id: string,
  timeoutMs = 3600000
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = readState(miseDir);
    const task = st.tasks[id];
    if (task?.answer) return task.answer;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

export function getTask(miseDir: string, id: string): Task | null {
  const st = readState(miseDir);
  return st.tasks[id] ?? null;
}

export function getAllTasks(miseDir: string): Task[] {
  const st = readState(miseDir);
  return Object.values(st.tasks);
}
