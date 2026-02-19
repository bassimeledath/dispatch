import { Command } from 'commander';

const program = new Command();

program
  .name('manager')
  .description('Parallel coding delegation system')
  .version('0.3.0');

program
  .command('dispatch <description>')
  .description('Dispatch a task to a background worker')
  .option('--tier <tier>', 'worker tier: quick, s1, or s2', 's1')
  .option('--model <model>', 'override implementer model for this task')
  .option('--engine <engine>', 'override engine for this task (claude, cursor)')
  .action(async (description, opts) => {
    const { dispatchCommand } = await import('./cli/commands/dispatch.js');
    await dispatchCommand(description, opts);
  });

program
  .command('status')
  .description('Show all tasks')
  .action(async () => {
    const { statusCommand } = await import('./cli/commands/status.js');
    await statusCommand();
  });

program
  .command('questions')
  .description('List tasks waiting for input')
  .action(async () => {
    const { questionsCommand } = await import('./cli/commands/questions.js');
    await questionsCommand();
  });

program
  .command('answer <id> <text>')
  .description('Answer a worker question to unblock it')
  .action(async (id, text) => {
    const { answerCommand } = await import('./cli/commands/answer.js');
    await answerCommand(id, text);
  });

program
  .command('log <id>')
  .description('Show worker log for a task')
  .action(async (id) => {
    const { logCommand } = await import('./cli/commands/log.js');
    await logCommand(id);
  });

program
  .command('cancel <id>')
  .description('Cancel a running task')
  .action(async (id) => {
    const { cancelCommand } = await import('./cli/commands/cancel.js');
    await cancelCommand(id);
  });

program
  .command('config [action] [key] [value]')
  .description('Get or set config values (list, get <key>, set <key> <value>)')
  .action(async (action, key, value) => {
    const { configCommand } = await import('./cli/commands/config.js');
    await configCommand(action ?? 'list', key, value);
  });

// Internal hidden command — spawned as detached worker process
program
  .command('_worker <id>', { hidden: true })
  .action(async (id) => {
    const { workerCommand } = await import('./cli/commands/worker.js');
    await workerCommand(id);
  });

async function main() {
  if (process.argv.slice(2).length === 0) {
    program.help();
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
