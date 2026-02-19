import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface MiseConfig {
  models: {
    quick: string;
    s1: string;
    s2: string;
    reviewer: string;
  };
  engine: string;
}

const DEFAULTS: MiseConfig = {
  models: {
    quick: 'claude-haiku-4-5',
    s1: 'claude-sonnet-4-6',
    s2: 'claude-sonnet-4-6',
    reviewer: 'claude-opus-4-6',
  },
  engine: 'claude',
};

function getConfigPath(): string {
  return join(homedir(), '.manager', 'config.json');
}

export function getConfig(): MiseConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return structuredClone(DEFAULTS);
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return {
      models: { ...DEFAULTS.models, ...(raw.models ?? {}) },
      engine: raw.engine ?? DEFAULTS.engine,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function setConfigValue(key: string, value: string): void {
  const config = getConfig();
  const parts = key.split('.');
  if (parts.length === 2 && parts[0] === 'models') {
    const modelKey = parts[1] as keyof MiseConfig['models'];
    if (modelKey in config.models) {
      config.models[modelKey] = value;
    } else {
      throw new Error(`Unknown model key: ${parts[1]}. Valid keys: quick, s1, s2, reviewer`);
    }
  } else if (parts.length === 1 && parts[0] === 'engine') {
    config.engine = value;
  } else {
    throw new Error(
      `Unknown config key: ${key}. Valid keys: engine, models.quick, models.s1, models.s2, models.reviewer`
    );
  }
  const dir = join(homedir(), '.manager');
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

export function getModels(): MiseConfig['models'] {
  return getConfig().models;
}

export function getEngine(): string {
  return getConfig().engine;
}
