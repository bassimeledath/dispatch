import { spawnSync } from 'node:child_process';
import { detectLanguage, detectPackageManager, detectBackpressureCommands } from '../utils/detect.js';

export interface LintResult {
  passed: boolean;
  output: string;
}

export function runLint(cwd: string, projectDir: string): LintResult {
  const language = detectLanguage(projectDir);
  const packageManager = detectPackageManager(projectDir);
  const commands = detectBackpressureCommands(projectDir, language, packageManager);

  const results: string[] = [];
  let allPassed = true;

  const toRun = [commands.lint, commands.typecheck].filter(Boolean) as string[];
  for (const cmd of toRun) {
    const [bin, ...args] = cmd.split(' ');
    const result = spawnSync(bin, args, {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
    });
    const out = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (result.status !== 0) {
      allPassed = false;
      results.push(`$ ${cmd}\n${out}`);
    }
  }

  return { passed: allPassed, output: results.join('\n\n') };
}
