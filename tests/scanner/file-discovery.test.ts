import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { discoverFiles } from '../../src/scanner/file-discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, 'file-discovery.fixtures/project-a');

describe('discoverFiles', () => {
  it('discovers package.json in project root', () => {
    const result = discoverFiles(FIXTURE_DIR);
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.languagesDetected).toContain('javascript');
    const jsPaths = result.files['javascript'] ?? [];
    expect(jsPaths.some(p => p.endsWith('package.json'))).toBe(true);
  });

  it('discovers requirements.txt in project root', () => {
    const result = discoverFiles(FIXTURE_DIR);
    expect(result.languagesDetected).toContain('python');
    const pyPaths = result.files['python'] ?? [];
    expect(pyPaths.some(p => p.endsWith('requirements.txt'))).toBe(true);
  });

  it('excludes node_modules directory', () => {
    const result = discoverFiles(FIXTURE_DIR);
    const allPaths = Object.values(result.files).flat();
    const hasNodeModules = allPaths.some(p => p.includes('node_modules'));
    expect(hasNodeModules).toBe(false);
  });

  it('excludes .git directory', () => {
    const result = discoverFiles(FIXTURE_DIR);
    const allPaths = Object.values(result.files).flat();
    const hasGit = allPaths.some(p => p.includes('/.git/'));
    expect(hasGit).toBe(false);
  });

  it('respects maxDepth=0 (root-only scan)', () => {
    const result = discoverFiles(FIXTURE_DIR, 0);
    // depth=0 means walk() is called with depth=0, so it scans rootDir entries
    // files directly in rootDir should be found; subdirs require depth+1=1 which exceeds maxDepth=0
    const allPaths = Object.values(result.files).flat();
    // node_modules/fake/package.json is 2 levels deep — should not be found
    const hasNodeModules = allPaths.some(p => p.includes('node_modules'));
    expect(hasNodeModules).toBe(false);
  });

  it('filters by language — only javascript when requested', () => {
    const result = discoverFiles(FIXTURE_DIR, 10, ['javascript']);
    expect(result.languagesDetected).toContain('javascript');
    expect(result.languagesDetected).not.toContain('python');
    expect(result.files['python']).toBeUndefined();
  });

  it('filters by language — only python when requested', () => {
    const result = discoverFiles(FIXTURE_DIR, 10, ['python']);
    expect(result.languagesDetected).toContain('python');
    expect(result.languagesDetected).not.toContain('javascript');
    expect(result.files['javascript']).toBeUndefined();
  });

  it('returns empty result for nonexistent directory', () => {
    const result = discoverFiles('/nonexistent/path/that/does/not/exist');
    expect(result.totalFiles).toBe(0);
    expect(result.languagesDetected).toHaveLength(0);
    expect(Object.keys(result.files)).toHaveLength(0);
  });

  it('returns correct totalFiles count', () => {
    const result = discoverFiles(FIXTURE_DIR);
    const countFromFiles = Object.values(result.files).reduce((sum, arr) => sum + arr.length, 0);
    expect(result.totalFiles).toBe(countFromFiles);
  });

  it('does not follow symlinks pointing outside the fixture dir', () => {
    // Create a temp project dir with a real file, then a symlink inside
    const tmpProject = join(tmpdir(), `sova-symlink-test-${Date.now()}`);
    const outsideDir = join(tmpdir(), `sova-symlink-outside-${Date.now()}`);

    try {
      mkdirSync(tmpProject, { recursive: true });
      mkdirSync(outsideDir, { recursive: true });

      // Place a real package.json inside the project (should be found normally)
      writeFileSync(join(tmpProject, 'package.json'), JSON.stringify({ name: 'real', version: '1.0.0', dependencies: { lodash: '4.17.21' } }), 'utf-8');

      // Place a package.json outside the project root
      writeFileSync(join(outsideDir, 'package.json'), JSON.stringify({ name: 'outside', version: '2.0.0', dependencies: { axios: '1.0.0' } }), 'utf-8');

      // Create a symlink inside the project that points to the outside dir
      try {
        symlinkSync(outsideDir, join(tmpProject, 'symlinked-dir'));
      } catch {
        // Symlink creation may fail on some systems (e.g. Windows without privileges)
        // In that case, skip the symlink-specific assertion
        return;
      }

      const result = discoverFiles(tmpProject);

      // The real package.json should be found
      const allPaths = Object.values(result.files).flat();
      expect(allPaths.some(p => p === join(tmpProject, 'package.json'))).toBe(true);

      // The symlinked directory should NOT be traversed — outside package.json must not appear
      expect(allPaths.some(p => p.startsWith(outsideDir))).toBe(false);
      expect(allPaths.some(p => p.includes('symlinked-dir'))).toBe(false);
    } finally {
      if (existsSync(tmpProject)) rmSync(tmpProject, { recursive: true, force: true });
      if (existsSync(outsideDir)) rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
