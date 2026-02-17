import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  createTempProject,
  createMiseDir,
  createStation,
  cleanupDir,
} from '../helpers/fixtures.js';
import { loadBoard, saveBoard, writeStatus } from '../../src/core/board.js';
import { BoardSchema } from '../../src/types/board.js';

describe('prep output parsing', () => {
  let dir: string;

  afterEach(() => {
    if (dir) cleanupDir(dir);
  });

  it('parses YAML board from fenced code block', () => {
    const yamlContent = stringifyYaml({
      version: 1,
      tasks: [
        {
          id: '1',
          title: 'Add button',
          group: 1,
          depends_on: [],
          size: 'S',
          parallel_safe: false,
          owned_paths: ['src/components/**'],
          acceptance_criteria: ['Button renders'],
          required_inputs: { env_vars: [], services: [], credentials: [], migrations: [] },
          blocking_questions: [],
          assumptions: [],
          status: 'pending',
        },
      ],
    });

    const fenced = '```yaml\n' + yamlContent + '```';
    const match = fenced.match(/```ya?ml\s*\n([\s\S]*?)```/);
    expect(match).not.toBeNull();
    const parsed = parseYaml(match![1]);
    const board = BoardSchema.parse(parsed);
    expect(board.tasks).toHaveLength(1);
    expect(board.tasks[0].id).toBe('1');
  });

  it('writes board.yaml and status files', () => {
    dir = createTempProject();
    const miseDir = createMiseDir(dir);
    createStation(miseDir);

    // Simulate what prep does after parsing
    const board = BoardSchema.parse({
      version: 1,
      tasks: [
        { id: '1', title: 'Task 1', group: 1, depends_on: [], size: 'M', status: 'pending' },
        { id: '2', title: 'Task 2', group: 1, depends_on: [], size: 'S', status: 'pending' },
      ],
    });

    saveBoard(miseDir, board);
    for (const task of board.tasks) {
      writeStatus(miseDir, task.id, {
        task_id: task.id,
        status: 'pending',
        updated_at: new Date().toISOString(),
      });
    }

    expect(existsSync(join(miseDir, 'board.yaml'))).toBe(true);
    expect(existsSync(join(miseDir, 'status', '1.yaml'))).toBe(true);
    expect(existsSync(join(miseDir, 'status', '2.yaml'))).toBe(true);

    const loaded = loadBoard(miseDir);
    expect(loaded.tasks).toHaveLength(2);
  });
});
