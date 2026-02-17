import * as output from '../../utils/output.js';
import { getMiseDir, isInitialized } from '../../utils/config.js';
import { recentEntries, totalCost } from '../../core/progress.js';

export interface LogOptions {
  verbose?: boolean;
  n?: string;
}

export async function logCommand(opts: LogOptions): Promise<void> {
  const projectDir = process.cwd();
  if (!isInitialized(projectDir)) {
    output.error('Not a mise project. Run `mise init` first.');
    process.exit(1);
  }

  const miseDir = getMiseDir(projectDir);
  const n = parseInt(opts.n ?? '20', 10);
  const entries = recentEntries(miseDir, n);

  if (entries.length === 0) {
    output.info('No progress entries yet.');
    return;
  }

  output.header('Progress Log');
  for (const entry of entries) {
    console.log(`  ${entry}`);
  }

  const cost = totalCost(miseDir);
  if (cost > 0) {
    console.log('');
    output.info(`Total cost: $${cost.toFixed(4)}`);
  }
}
