import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readState,
  writeState,
  addTask,
  updateTask,
  getTask,
  getAllTasks,
  setQuestion,
  setAnswer,
  generateId,
  getMiseDir,
} from '../../src/core/state.js';

function createTempDir(): string {
  const dir = join(tmpdir(), `mise-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('state', () => {
  let projectDir: string;
  let miseDir: string;

  beforeEach(() => {
    projectDir = createTempDir();
    miseDir = getMiseDir(projectDir);
    mkdirSync(miseDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('readState returns empty state when no file exists', () => {
    const state = readState(miseDir);
    expect(state.version).toBe(1);
    expect(state.tasks).toEqual({});
  });

  it('writeState and readState roundtrip', () => {
    const state = readState(miseDir);
    writeState(miseDir, state);
    const reloaded = readState(miseDir);
    expect(reloaded).toEqual(state);
  });

  it('addTask creates a task with correct defaults', () => {
    const task = addTask(miseDir, 'abc123', 'fix the typo', 'quick');
    expect(task.id).toBe('abc123');
    expect(task.description).toBe('fix the typo');
    expect(task.tier).toBe('quick');
    expect(task.status).toBe('pending');
    expect(task.model).toBe('claude-haiku-4-5');
    expect(task.pid).toBeNull();
    expect(task.pr).toBeNull();
    expect(task.retries).toBe(0);
  });

  it('addTask persists to disk', () => {
    addTask(miseDir, 'abc123', 'fix the typo', 'quick');
    const state = readState(miseDir);
    expect(state.tasks['abc123']).toBeDefined();
  });

  it('s2 tier gets sonnet model', () => {
    const task = addTask(miseDir, 'xyz', 'big feature', 's2');
    expect(task.model).toBe('claude-sonnet-4-6');
  });

  it('updateTask merges updates and bumps updated timestamp', async () => {
    addTask(miseDir, 'abc123', 'fix the typo', 's1');
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 10));
    const updated = updateTask(miseDir, 'abc123', { status: 'running', pid: 1234 });
    expect(updated.status).toBe('running');
    expect(updated.pid).toBe(1234);
    expect(updated.updated > before).toBe(true);
  });

  it('updateTask throws for unknown task', () => {
    expect(() => updateTask(miseDir, 'nope', { status: 'running' })).toThrow('Task nope not found');
  });

  it('getTask returns null for missing task', () => {
    expect(getTask(miseDir, 'missing')).toBeNull();
  });

  it('getTask returns task after addTask', () => {
    addTask(miseDir, 'abc123', 'fix', 's1');
    const task = getTask(miseDir, 'abc123');
    expect(task?.id).toBe('abc123');
  });

  it('getAllTasks returns all tasks', () => {
    addTask(miseDir, 'aaa', 'task 1', 'quick');
    addTask(miseDir, 'bbb', 'task 2', 's1');
    addTask(miseDir, 'ccc', 'task 3', 's2');
    expect(getAllTasks(miseDir)).toHaveLength(3);
  });

  it('setQuestion sets waiting status and question', () => {
    addTask(miseDir, 'abc', 'task', 's1');
    setQuestion(miseDir, 'abc', 'What framework?');
    const task = getTask(miseDir, 'abc');
    expect(task?.status).toBe('waiting');
    expect(task?.question).toBe('What framework?');
    expect(task?.answer).toBeNull();
  });

  it('setAnswer stores the answer', () => {
    addTask(miseDir, 'abc', 'task', 's1');
    setQuestion(miseDir, 'abc', 'What framework?');
    setAnswer(miseDir, 'abc', 'Express');
    const task = getTask(miseDir, 'abc');
    expect(task?.answer).toBe('Express');
  });

  it('generateId returns 8-char hex string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('multiple generateId calls produce unique values', () => {
    const ids = new Set(Array.from({ length: 20 }, generateId));
    expect(ids.size).toBe(20);
  });
});
