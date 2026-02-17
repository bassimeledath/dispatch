import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { globSync } from 'glob';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

interface TocEntry {
  path: string;
  purpose: string;
}

interface TocMeta {
  generated_at: string;
  fingerprints: Record<string, string>;
}

const TOC_PATTERNS = [
  'README*',
  'docs/**/*.md',
  'doc/**/*.md',
  'ARCHITECTURE*',
  'DESIGN*',
  'CONTRIBUTING*',
  'CHANGELOG*',
  'src/main.*',
  'src/index.*',
  'src/app.*',
  'src/lib.*',
  'app/layout.*',
  'app/page.*',
  'pages/index.*',
  'pages/_app.*',
];

const MAX_TOC_LINES = 100;

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function extractPurpose(filePath: string, content: string): string {
  // Try to extract first heading
  const headingMatch = content.match(/^#\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim();

  // Try first non-empty line for non-markdown files
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length > 0) {
    const first = lines[0].trim();
    if (first.startsWith('//') || first.startsWith('#') || first.startsWith('/*')) {
      return first.replace(/^[/#*\s]+/, '').trim().slice(0, 80);
    }
  }

  // Fallback to filename
  return filePath.split('/').pop() ?? filePath;
}

export function generateToc(projectDir: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const seen = new Set<string>();

  for (const pattern of TOC_PATTERNS) {
    const matches = globSync(pattern, { cwd: projectDir, nodir: true, dot: false });
    for (const match of matches) {
      if (seen.has(match)) continue;
      seen.add(match);

      const fullPath = join(projectDir, match);
      try {
        const content = readFileSync(fullPath, 'utf-8');
        entries.push({
          path: match,
          purpose: extractPurpose(match, content),
        });
      } catch {
        entries.push({ path: match, purpose: match });
      }

      if (entries.length >= MAX_TOC_LINES) break;
    }
    if (entries.length >= MAX_TOC_LINES) break;
  }

  return entries;
}

export function writeToc(miseDir: string, projectDir: string): void {
  const entries = generateToc(projectDir);

  // Write toc.md
  const lines = ['# Table of Contents', '', '| File | Purpose |', '|------|---------|'];
  for (const entry of entries) {
    lines.push(`| \`${entry.path}\` | ${entry.purpose} |`);
  }
  writeFileSync(join(miseDir, 'toc.md'), lines.join('\n') + '\n', 'utf-8');

  // Write fingerprint metadata
  writeMeta(miseDir, projectDir, entries);
}

export function writeMeta(miseDir: string, projectDir: string, entries: TocEntry[]): void {
  const fingerprints: Record<string, string> = {};
  for (const entry of entries) {
    const fullPath = join(projectDir, entry.path);
    try {
      const content = readFileSync(fullPath, 'utf-8');
      fingerprints[entry.path] = fingerprint(content);
    } catch {
      // skip files that can't be read
    }
  }

  const meta: TocMeta = {
    generated_at: new Date().toISOString(),
    fingerprints,
  };

  writeFileSync(join(miseDir, 'toc.meta.yaml'), stringifyYaml(meta), 'utf-8');
}

export function hasDrifted(miseDir: string, projectDir: string): boolean {
  const metaPath = join(miseDir, 'toc.meta.yaml');
  if (!existsSync(metaPath)) return true;

  try {
    const raw = readFileSync(metaPath, 'utf-8');
    const meta = parseYaml(raw) as TocMeta;

    for (const [path, savedHash] of Object.entries(meta.fingerprints)) {
      const fullPath = join(projectDir, path);
      if (!existsSync(fullPath)) return true;
      const content = readFileSync(fullPath, 'utf-8');
      if (fingerprint(content) !== savedHash) return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function refreshIfNeeded(miseDir: string, projectDir: string): boolean {
  if (hasDrifted(miseDir, projectDir)) {
    writeToc(miseDir, projectDir);
    return true;
  }
  return false;
}

export function readToc(miseDir: string): string {
  const tocPath = join(miseDir, 'toc.md');
  if (!existsSync(tocPath)) return '';
  return readFileSync(tocPath, 'utf-8');
}
