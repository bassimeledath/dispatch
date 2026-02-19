import * as output from '../../utils/output.js';
import { getMiseDir, getAllTasks } from '../../core/state.js';

export async function questionsCommand(): Promise<void> {
  const miseDir = getMiseDir(process.cwd());
  const tasks = getAllTasks(miseDir);
  const waiting = tasks.filter((t) => t.status === 'waiting' && t.question);

  if (waiting.length === 0) {
    output.info('No tasks waiting for input.');
    return;
  }

  output.header('Pending Questions');
  for (const task of waiting) {
    output.info(`[${task.id}] ${task.description.slice(0, 50)}`);
    console.log(`         Q: ${task.question}`);
    output.dim(`    Answer: manager answer ${task.id} "<your answer>"`);
    console.log('');
  }
}
