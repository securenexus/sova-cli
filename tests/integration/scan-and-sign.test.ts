// tests/integration/scan-and-sign.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanProject } from '../../src/index.js';
import { verifyManifest } from '../../src/crypto/verifier.js';
import { DEFAULT_CONFIG } from '../../src/config/sovarc.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('End-to-end: scan + sign + verify', () => {
  let projectDir: string;
  let keyDir: string;
  let baseDir: string;

  beforeEach(() => {
    baseDir = join(tmpdir(), `sova-e2e-${Date.now()}`);
    projectDir = join(baseDir, 'project');
    keyDir = join(baseDir, 'keys');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(keyDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('scan produces a signed manifest that verifies', async () => {
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
    }));

    const config = {
      ...DEFAULT_CONFIG,
      signing: { autoSign: true, keyPath: keyDir },
    };

    const manifest = await scanProject({
      path: projectDir,
      output: 'sova-manifest.json',
      includeDev: true,
      verbose: false,
      maxDepth: 10,
      config,
    });

    expect(manifest.integrity).toBeDefined();
    expect(manifest.integrity!.algorithm).toBe('Ed25519');

    const result = verifyManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it('tampered manifest fails verification', async () => {
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: { lodash: '^4.17.0' },
    }));

    const config = {
      ...DEFAULT_CONFIG,
      signing: { autoSign: true, keyPath: keyDir },
    };

    const manifest = await scanProject({
      path: projectDir,
      output: 'sova-manifest.json',
      includeDev: true,
      verbose: false,
      maxDepth: 10,
      config,
    });

    manifest.applications.javascript.push('evil_:_0.0.1');

    const result = verifyManifest(manifest);
    expect(result.valid).toBe(false);
  });

  it('noSign option produces unsigned manifest', async () => {
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
    }));

    const manifest = await scanProject({
      path: projectDir,
      output: 'sova-manifest.json',
      includeDev: true,
      verbose: false,
      maxDepth: 10,
      noSign: true,
    });

    expect(manifest.integrity).toBeUndefined();
  });

  it('pre-scan aborts on too many files with low maxFiles limit', async () => {
    writeFileSync(join(projectDir, 'package.json'), '{}');
    writeFileSync(join(projectDir, 'requirements.txt'), 'flask');
    writeFileSync(join(projectDir, 'go.mod'), 'module x');

    const config = {
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits, maxFiles: 2 },
      signing: { autoSign: true, keyPath: keyDir },
    };

    await expect(scanProject({
      path: projectDir,
      output: 'sova-manifest.json',
      includeDev: true,
      verbose: false,
      maxDepth: 10,
      config,
    })).rejects.toThrow(/exceeds limit/);
  });
});
