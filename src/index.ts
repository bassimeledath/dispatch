import { createProgram } from './cli/args.js';

const program = createProgram();

// Subcommands will be registered by their respective modules
// Stub registrations for now — filled in by later tasks

program
  .command('init')
  .description('Initialize mise in the current project')
  .action(async () => {
    const { initCommand } = await import('./cli/commands/init.js');
    await initCommand(program.opts());
  });

program
  .command('prep [prompt]')
  .description('Plan tasks from a prompt or PRD')
  .option('--prd <file>', 'path to PRD file')
  .action(async (prompt, opts) => {
    const { prepCommand } = await import('./cli/commands/prep.js');
    await prepCommand(prompt, { ...program.opts(), ...opts });
  });

program
  .command('run')
  .description('Execute the next ready task')
  .option('--task <id>', 'run a specific task')
  .option('--retries <n>', 'max retries on backpressure failure', '2')
  .action(async (opts) => {
    const { runCommand } = await import('./cli/commands/run.js');
    await runCommand({ ...program.opts(), ...opts });
  });

program
  .command('loop')
  .description('Execute all ready tasks in sequence')
  .option('--skip-failures', 'skip failed tasks and continue')
  .option('--max-retries <n>', 'max retries per task', '2')
  .action(async (opts) => {
    const { loopCommand } = await import('./cli/commands/loop.js');
    await loopCommand({ ...program.opts(), ...opts });
  });

program
  .command('status')
  .description('Show board status')
  .action(async () => {
    const { statusCommand } = await import('./cli/commands/status.js');
    await statusCommand(program.opts());
  });

program
  .command('log')
  .description('Show progress log')
  .option('-n <lines>', 'number of recent entries', '20')
  .action(async (opts) => {
    const { logCommand } = await import('./cli/commands/log.js');
    await logCommand({ ...program.opts(), ...opts });
  });

// Handle bare prompt: `mise "add a button"` or `mise --prd file.md`
const knownCommands = new Set(['init', 'prep', 'run', 'loop', 'status', 'log', 'help']);

async function main() {
  const args = process.argv.slice(2);

  // If first arg isn't a known command, treat as bare prompt
  if (args.length > 0 && !args[0].startsWith('-') && !knownCommands.has(args[0])) {
    const prompt = args.join(' ');
    const { prepCommand } = await import('./cli/commands/prep.js');
    const { loopCommand } = await import('./cli/commands/loop.js');
    const globalOpts = program.opts();
    await prepCommand(prompt, globalOpts);
    await loopCommand(globalOpts);
    return;
  }

  // Handle --prd without subcommand
  if (args.length > 0 && args[0] === '--prd') {
    program.parse(process.argv);
    const opts = program.opts();
    if (opts.prd) {
      const { prepCommand } = await import('./cli/commands/prep.js');
      const { loopCommand } = await import('./cli/commands/loop.js');
      await prepCommand(undefined, opts);
      await loopCommand(opts);
      return;
    }
  }

  program.parse(process.argv);

  // No args at all: show help
  if (args.length === 0) {
    program.help();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
