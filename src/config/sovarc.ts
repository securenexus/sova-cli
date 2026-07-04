// src/config/sovarc.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseSize } from '../utils/parse-size.js';

export interface SovaConfig {
  limits: {
    maxDepth: number;
    maxFiles: number;
    maxFileSize: number;      // bytes
    maxTotalSize: number;     // bytes
    maxOutputSize: number;    // bytes
  };
  signing: {
    autoSign: boolean;
    keyPath: string;
  };
}

export const DEFAULT_CONFIG: SovaConfig = {
  limits: {
    maxDepth: 10,
    maxFiles: 10_000,
    maxFileSize: 50 * 1024 * 1024,       // 50 MB
    maxTotalSize: 500 * 1024 * 1024,     // 500 MB
    maxOutputSize: 100 * 1024 * 1024,    // 100 MB
  },
  signing: {
    autoSign: true,
    keyPath: join(homedir(), '.sova', 'keys'),
  },
};

function readJsonFile(filePath: string): Record<string, any> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function normalizeLimits(raw: Record<string, any>): Record<string, any> {
  if (!raw.limits) return raw;
  const limits = { ...raw.limits };
  for (const key of ['maxFileSize', 'maxTotalSize', 'maxOutputSize']) {
    if (key in limits && typeof limits[key] === 'string') {
      limits[key] = parseSize(limits[key]);
    }
  }
  return { ...raw, limits };
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(
  projectDir: string,
  globalConfigDir: string,
  cliOverrides?: Partial<{ limits: Partial<SovaConfig['limits']>; signing: Partial<SovaConfig['signing']> }>,
): SovaConfig {
  let config: Record<string, any> = structuredClone(DEFAULT_CONFIG);

  const globalRaw = normalizeLimits(readJsonFile(join(globalConfigDir, 'config.json')));
  config = deepMerge(config, globalRaw);

  const projectRaw = normalizeLimits(readJsonFile(join(projectDir, '.sovarc')));
  config = deepMerge(config, projectRaw);

  if (cliOverrides) {
    config = deepMerge(config, cliOverrides as Record<string, any>);
  }

  return config as SovaConfig;
}
