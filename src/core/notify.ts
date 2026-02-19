import { spawn } from 'node:child_process';

export function notify(title: string, message: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('osascript', ['-e', `display notification "${message}" with title "${title}"`], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } else if (platform === 'linux') {
    spawn('notify-send', [title, message], { stdio: 'ignore', detached: true }).unref();
  }
  // Windows: no-op
}

export function notifyQuestion(taskId: string, question: string): void {
  notify('mise', `Task ${taskId} needs input: ${question.slice(0, 80)}`);
}

export function notifyComplete(taskId: string, description: string): void {
  notify('mise', `Task ${taskId} complete: ${description.slice(0, 60)}`);
}

export function notifyError(taskId: string, error: string): void {
  notify('mise', `Task ${taskId} failed: ${error.slice(0, 60)}`);
}
