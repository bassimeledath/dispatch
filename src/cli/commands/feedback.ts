import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, release } from 'node:os';
import * as output from '../../utils/output.js';

const REPO = 'bassimeledath/mise';

export async function feedbackCommand(message: string): Promise<void> {
  if (!message || message.trim().length === 0) {
    output.error('Please provide feedback: mise feedback "your feedback here"');
    process.exit(1);
  }

  // Check gh CLI is available
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    output.error('GitHub CLI (gh) is required. Install it: https://cli.github.com');
    process.exit(1);
  }

  // Check gh auth
  try {
    execSync('gh auth status', { stdio: 'ignore' });
  } catch {
    output.error('Not authenticated with GitHub CLI. Run `gh auth login` first.');
    process.exit(1);
  }

  const title = message.trim().length > 70
    ? message.trim().slice(0, 67) + '...'
    : message.trim();

  const body = [
    '## Feedback',
    '',
    message.trim(),
    '',
    '---',
    `*Submitted via \`mise feedback\`*`,
    '',
    '| | |',
    '|---|---|',
    `| OS | ${platform()} ${release()} |`,
    `| Node | ${process.version} |`,
    `| Mise | ${getMiseVersion()} |`,
  ].join('\n');

  output.info('Submitting feedback...');

  try {
    const result = execSync(
      `gh issue create --repo ${REPO} --title "${escapeShell(title)}" --label feedback --body "${escapeShell(body)}"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    output.ok(`Feedback submitted: ${result}`);
  } catch (err: any) {
    // Label might not exist yet — retry without it
    try {
      const result = execSync(
        `gh issue create --repo ${REPO} --title "${escapeShell(title)}" --body "${escapeShell(body)}"`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      output.ok(`Feedback submitted: ${result}`);
    } catch (retryErr: any) {
      output.error(`Failed to submit feedback: ${retryErr.message ?? retryErr}`);
      process.exit(1);
    }
  }
}

function getMiseVersion(): string {
  try {
    const thisDir = import.meta.dirname ?? join(fileURLToPath(import.meta.url), '..');
    // Walk up from dist/cli/commands/ or src/cli/commands/ to find package.json
    const candidates = [
      join(thisDir, '..', '..', '..', 'package.json'),
      join(thisDir, '..', '..', 'package.json'),
    ];
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf-8'));
        if (pkg.name === 'mise-cli') return pkg.version;
      } catch { continue; }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function escapeShell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}
