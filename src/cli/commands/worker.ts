import { runWorker } from '../../core/worker.js';

export async function workerCommand(taskId: string): Promise<void> {
  await runWorker(taskId);
}
