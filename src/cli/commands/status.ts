import * as output from '../../utils/output.js';
import { getMiseDir, getAllTasks } from '../../core/state.js';

function statusIcon(status: string): string {
  switch (status) {
    case 'complete':
      return '✓';
    case 'failed':
      return '✗';
    case 'running':
      return '●';
    case 'waiting':
      return '?';
    case 'cancelled':
      return '○';
    default:
      return '·';
  }
}

export async function statusCommand(): Promise<void> {
  const miseDir = getMiseDir(process.cwd());
  const tasks = getAllTasks(miseDir);

  if (tasks.length === 0) {
    output.info('No tasks dispatched yet. Run `manager dispatch "<description>"` to start.');
    return;
  }

  output.header('Manager Tasks');
  const rows: string[][] = [['ID', 'Tier', 'Status', 'Description']];
  for (const task of tasks.sort((a, b) => b.created.localeCompare(a.created))) {
    const icon = statusIcon(task.status);
    rows.push([task.id, task.tier, `${icon} ${task.status}`, task.description.slice(0, 50)]);
  }
  output.table(rows);

  const waiting = tasks.filter((t) => t.status === 'waiting');
  if (waiting.length > 0) {
    console.log('');
    output.warn(`${waiting.length} task(s) waiting for input — run \`manager questions\``);
  }
}
