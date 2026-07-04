// tests/scanner/pre-scan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { preScan, type PreScanResult } from '../../src/scanner/pre-scan.js';
import { DEFAULT_CONFIG } from '../../src/config/sovarc.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('preScan', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `sova-prescan-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('counts matching files correctly', () => {
    writeFileSync(join(tempDir, 'package.json'), '{}');
    writeFileSync(join(tempDir, 'requirements.txt'), 'flask==2.0');
    writeFileSync(join(tempDir, 'README.md'), '# Hello'); // not a dep file

    const result = preScan(tempDir, DEFAULT_CONFIG.limits);
    expect(result.fileCount).toBe(2);
    expect(result.skippedFiles).toHaveLength(0);
  });

  it('skips files exceeding maxFileSize and records them', () => {
    writeFileSync(join(tempDir, 'package.json'), '{}');
    const bigContent = 'x'.repeat(100);
    writeFileSync(join(tempDir, 'yarn.lock'), bigContent);

    const limits = { ...DEFAULT_CONFIG.limits, maxFileSize: 50 };
    const result = preScan(tempDir, limits);
    expect(result.fileCount).toBe(2);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0].path).toContain('yarn.lock');
  });

  it('throws when maxFiles is exceeded', () => {
    writeFileSync(join(tempDir, 'package.json'), '{}');
    writeFileSync(join(tempDir, 'requirements.txt'), 'flask');
    writeFileSync(join(tempDir, 'go.mod'), 'module x');

    const limits = { ...DEFAULT_CONFIG.limits, maxFiles: 2 };
    expect(() => preScan(tempDir, limits)).toThrow(/exceeds limit of 2/);
  });

  it('throws when maxTotalSize is exceeded', () => {
    writeFileSync(join(tempDir, 'package.json'), 'x'.repeat(200));

    const limits = { ...DEFAULT_CONFIG.limits, maxTotalSize: 100 };
    expect(() => preScan(tempDir, limits)).toThrow(/total scan size/i);
  });

  it('respects maxDepth', () => {
    const deep = join(tempDir, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, 'package.json'), '{}');

    const limits = { ...DEFAULT_CONFIG.limits, maxDepth: 1 };
    const result = preScan(tempDir, limits);
    expect(result.fileCount).toBe(0);
  });

  it('skips excluded directories', () => {
    const nm = join(tempDir, 'node_modules', 'foo');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'package.json'), '{}');

    const result = preScan(tempDir, DEFAULT_CONFIG.limits);
    expect(result.fileCount).toBe(0);
  });

  it('tracks maxDepthReached', () => {
    const sub = join(tempDir, 'sub');
    mkdirSync(sub);
    writeFileSync(join(sub, 'package.json'), '{}');

    const result = preScan(tempDir, DEFAULT_CONFIG.limits);
    expect(result.maxDepthReached).toBe(1);
  });
});
