import * as output from '../../utils/output.js';
import { loadBoard } from '../../core/board.js';
import { getMiseDir, isInitialized } from '../../utils/config.js';

export interface StatusOptions {
  verbose?: boolean;
}

export async function statusCommand(_opts: StatusOptions): Promise<void> {
  const projectDir = process.cwd();
  if (!isInitialized(projectDir)) {
    output.error('Not a mise project. Run `mise init` first.');
    process.exit(1);
  }

  const miseDir = getMiseDir(projectDir);
  let board;
  try {
    board = loadBoard(miseDir);
  } catch {
    output.error('No board found. Run `mise prep` first.');
    process.exit(1);
  }

  output.header('Board Status');

  const counts: Record<string, number> = {};
  for (const task of board.tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }

  const rows: string[][] = [['Status', 'Count']];
  for (const [status, count] of Object.entries(counts)) {
    rows.push([status, String(count)]);
  }
  output.table(rows);

  console.log('');
  output.header('Tasks');
  const taskRows: string[][] = [['ID', 'Title', 'Status', 'Group', 'Size']];
  for (const task of board.tasks) {
    taskRows.push([task.id, task.title, task.status, String(task.group), task.size]);
  }
  output.table(taskRows);
}
