import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('mise')
    .description('CLI orchestrator for long-running coding agents')
    .version('0.2.0')
    .option('--verbose', 'verbose output', false)
    .option('-y, --yes', 'auto-approve plans without prompting', false)
    .option('--no-color', 'disable colors')
    .option('--prd <file>', 'path to PRD file');

  return program;
}
