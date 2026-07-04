// tests/config/sovarc.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, DEFAULT_CONFIG, type SovaConfig } from '../../src/config/sovarc.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `sova-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns default config when no config files exist', () => {
    const config = loadConfig(tempDir, tempDir);
    expect(config.limits.maxDepth).toBe(DEFAULT_CONFIG.limits.maxDepth);
    expect(config.limits.maxFiles).toBe(DEFAULT_CONFIG.limits.maxFiles);
    expect(config.signing.autoSign).toBe(true);
  });

  it('loads project-level .sovarc and merges with defaults', () => {
    writeFileSync(join(tempDir, '.sovarc'), JSON.stringify({
      limits: { maxFiles: 5000 },
    }));
    const config = loadConfig(tempDir, tempDir);
    expect(config.limits.maxFiles).toBe(5000);
    expect(config.limits.maxDepth).toBe(DEFAULT_CONFIG.limits.maxDepth);
  });

  it('global config is overridden by project config', () => {
    const globalDir = join(tempDir, 'global');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, 'config.json'), JSON.stringify({
      limits: { maxFiles: 20000 },
    }));
    writeFileSync(join(tempDir, '.sovarc'), JSON.stringify({
      limits: { maxFiles: 3000 },
    }));
    const config = loadConfig(tempDir, globalDir);
    expect(config.limits.maxFiles).toBe(3000);
  });

  it('CLI overrides take highest precedence', () => {
    writeFileSync(join(tempDir, '.sovarc'), JSON.stringify({
      limits: { maxFiles: 3000 },
    }));
    const config = loadConfig(tempDir, tempDir, { limits: { maxFiles: 999 } });
    expect(config.limits.maxFiles).toBe(999);
  });

  it('parses size strings in config files', () => {
    writeFileSync(join(tempDir, '.sovarc'), JSON.stringify({
      limits: { maxFileSize: '100MB' },
    }));
    const config = loadConfig(tempDir, tempDir);
    expect(config.limits.maxFileSize).toBe(100 * 1024 * 1024);
  });

  it('ignores malformed config files gracefully', () => {
    writeFileSync(join(tempDir, '.sovarc'), 'not valid json{{{');
    const config = loadConfig(tempDir, tempDir);
    expect(config.limits.maxDepth).toBe(DEFAULT_CONFIG.limits.maxDepth);
  });
});
