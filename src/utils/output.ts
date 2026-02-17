import pc from 'picocolors';
import { createInterface } from 'node:readline';

const isTTY = process.stdout.isTTY ?? false;

function colorize(fn: (s: string) => string, text: string): string {
  return isTTY ? fn(text) : text;
}

export function header(text: string): void {
  console.log(colorize(pc.bold, `\n${text}`));
  console.log(colorize(pc.dim, '─'.repeat(Math.min(text.length + 2, 60))));
}

export function info(text: string): void {
  console.log(colorize(pc.cyan, '  ') + text);
}

export function ok(text: string): void {
  console.log(colorize(pc.green, '  ✓ ') + text);
}

export function warn(text: string): void {
  console.log(colorize(pc.yellow, '  ⚠ ') + text);
}

export function error(text: string): void {
  console.error(colorize(pc.red, '  ✗ ') + text);
}

export function dim(text: string): void {
  console.log(colorize(pc.dim, `  ${text}`));
}

export async function ask(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(colorize(pc.cyan, '  ? ') + question + ' ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`${question} ${hint}`);
  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

export function spinner(label: string): { stop: (message?: string) => void } {
  if (!isTTY) {
    console.log(`  ${label}...`);
    return { stop: (msg?: string) => msg && console.log(`  ${msg}`) };
  }

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${colorize(pc.cyan, frames[i % frames.length])} ${label}`);
    i++;
  }, 80);

  return {
    stop(message?: string) {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(label.length + 10) + '\r');
      if (message) {
        console.log(`  ${message}`);
      }
    },
  };
}

export function table(rows: string[][]): void {
  if (rows.length === 0) return;
  const widths = rows[0].map((_, colIdx) =>
    Math.max(...rows.map((row) => (row[colIdx] ?? '').length))
  );
  for (const row of rows) {
    const line = row.map((cell, i) => (cell ?? '').padEnd(widths[i])).join('  ');
    console.log(`  ${line}`);
  }
}
