import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as output from '../../utils/output.js';
import { getMiseDir, isInitialized, loadStation } from '../../utils/config.js';
import { createEngine } from '../../engines/claude.js';
import { loadTemplate, interpolate } from '../../utils/prompt.js';
import { BoardSchema, type Board } from '../../types/board.js';
import { saveBoard, writeStatus } from '../../core/board.js';
import { readToc } from '../../core/toc.js';
import { TaskStatus } from '../../types/status.js';

export interface PrepOptions {
  verbose?: boolean;
  prd?: string;
}

export async function prepCommand(
  prompt: string | undefined,
  opts: PrepOptions
): Promise<void> {
  const projectDir = process.cwd();

  if (!isInitialized(projectDir)) {
    output.error('Not a mise project. Run `mise init` first.');
    process.exit(1);
  }

  const miseDir = getMiseDir(projectDir);
  const station = loadStation(projectDir);

  // Get the prompt text
  let promptText = prompt ?? '';
  if (opts.prd) {
    if (!existsSync(opts.prd)) {
      output.error(`PRD file not found: ${opts.prd}`);
      process.exit(1);
    }
    promptText = readFileSync(opts.prd, 'utf-8');
  }

  if (!promptText.trim()) {
    output.error('No prompt provided. Use `mise prep "your task"` or `mise prep --prd file.md`');
    process.exit(1);
  }

  output.header('Planning');
  output.info('Building planning prompt...');

  // Build the planning prompt
  const template = loadTemplate('plan');
  const toc = readToc(miseDir);
  const planPrompt = interpolate(template, {
    PROJECT_NAME: station.project.name,
    LANGUAGE: station.project.language ?? 'unknown',
    FRAMEWORK: station.project.framework ?? 'none',
    PACKAGE_MANAGER: station.project.package_manager ?? 'unknown',
    TOC: toc || '_No TOC generated yet._',
    RULES: station.rules.length > 0 ? station.rules.map((r) => `- ${r}`).join('\n') : '_None configured._',
    BOUNDARIES: station.boundaries.length > 0 ? station.boundaries.map((b) => `- ${b}`).join('\n') : '_None configured._',
    PROMPT: promptText,
  });

  // Run the engine
  const engine = createEngine(station.engine.name);
  const engineAvailable = await engine.check();
  if (!engineAvailable) {
    output.error('Claude CLI not available. Install it first.');
    process.exit(1);
  }

  const spin = output.spinner('Planning with Claude...');
  const result = await engine.run(planPrompt, {
    cwd: projectDir,
    model: station.engine.model,
    verbose: opts.verbose,
  });
  spin.stop();

  if (result.exitCode !== 0) {
    output.error('Engine failed:');
    console.error(result.stderr);
    process.exit(1);
  }

  // Parse the YAML output from fenced code blocks
  const board = parseEngineOutput(result.stdout);
  if (!board) {
    output.error('Failed to parse agent output. Raw output:');
    console.log(result.stdout);
    process.exit(1);
  }

  // Show plan summary
  output.header('Plan Summary');

  const groups = [...new Set(board.tasks.map((t) => t.group))].sort((a, b) => a - b);
  for (const group of groups) {
    const groupTasks = board.tasks.filter((t) => t.group === group);
    output.info(`Group ${group}:`);
    for (const task of groupTasks) {
      const deps = task.depends_on.length > 0 ? ` (deps: ${task.depends_on.join(', ')})` : '';
      const par = task.parallel_safe ? ' [parallel]' : '';
      output.info(`  ${task.id}: ${task.title} [${task.size}]${deps}${par}`);
    }
  }

  console.log('');
  output.info(`Total: ${board.tasks.length} tasks in ${groups.length} groups`);

  // In attended mode, ask for approval
  if (station.mode.attended) {
    const approved = await output.confirm('Approve this plan?');
    if (!approved) {
      output.info('Plan rejected. Modify and re-run `mise prep`.');
      return;
    }
  }

  // Save the board
  saveBoard(miseDir, board);

  // Initialize status files
  const statusDir = join(miseDir, 'status');
  mkdirSync(statusDir, { recursive: true });
  for (const task of board.tasks) {
    writeStatus(miseDir, task.id, {
      task_id: task.id,
      status: TaskStatus.PENDING,
      updated_at: new Date().toISOString(),
    });
  }

  output.ok('Board saved. Run `mise loop` to execute.');
}

function parseEngineOutput(stdout: string): Board | null {
  // Try to extract YAML from fenced code blocks
  const yamlMatch = stdout.match(/```ya?ml\s*\n([\s\S]*?)```/);
  let yamlContent: string;

  if (yamlMatch) {
    yamlContent = yamlMatch[1];
  } else {
    // Try to extract from stream-json format
    const lines = stdout.trim().split('\n');
    const textParts: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'assistant' && parsed.content) {
          for (const block of parsed.content) {
            if (block.type === 'text') {
              textParts.push(block.text);
            }
          }
        }
        if (parsed.type === 'result' && parsed.result) {
          textParts.push(parsed.result);
        }
      } catch {
        // Not JSON, try as raw text
        textParts.push(line);
      }
    }
    const fullText = textParts.join('\n');
    const innerMatch = fullText.match(/```ya?ml\s*\n([\s\S]*?)```/);
    if (innerMatch) {
      yamlContent = innerMatch[1];
    } else {
      // Last resort: try parsing the whole output as YAML
      yamlContent = fullText;
    }
  }

  try {
    const data = parseYaml(yamlContent);
    return BoardSchema.parse(data);
  } catch (err: any) {
    return null;
  }
}
