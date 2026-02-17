// Simple minimatch-like helper for path overlap detection
// We don't need full minimatch — just basic prefix/glob comparison

export function minimatch(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*');

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(path);
}
