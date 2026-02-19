import * as output from '../../utils/output.js';
import { getMiseDir, getTask, setAnswer, updateTask } from '../../core/state.js';

export async function answerCommand(taskId: string, answer: string): Promise<void> {
  const miseDir = getMiseDir(process.cwd());
  const task = getTask(miseDir, taskId);

  if (!task) {
    output.error(`Task ${taskId} not found.`);
    process.exit(1);
  }

  if (task.status !== 'waiting') {
    output.error(`Task ${taskId} is not waiting for input (status: ${task.status}).`);
    process.exit(1);
  }

  setAnswer(miseDir, taskId, answer);
  // Reset status to running so UI reflects it immediately; worker polls and resumes
  updateTask(miseDir, taskId, { status: 'running' });
  output.ok(`Answer sent to task ${taskId}. Worker will resume shortly.`);
}
