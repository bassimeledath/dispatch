import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { StationSchema, type Station } from '../types/station.js';

export function getMiseDir(projectDir: string): string {
  return join(projectDir, '.mise');
}

export function isInitialized(projectDir: string): boolean {
  return existsSync(join(getMiseDir(projectDir), 'station.yaml'));
}

export function loadStation(projectDir: string): Station {
  const stationPath = join(getMiseDir(projectDir), 'station.yaml');
  if (!existsSync(stationPath)) {
    throw new Error(`No station.yaml found at ${stationPath}. Run \`mise init\` first.`);
  }
  const raw = readFileSync(stationPath, 'utf-8');
  const data = parseYaml(raw);
  return StationSchema.parse(data);
}
