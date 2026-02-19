import { join } from 'node:path';

export function getMiseDir(projectDir: string): string {
  return join(projectDir, '.manager');
}
