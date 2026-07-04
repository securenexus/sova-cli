import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { SOVA_VERSION } from '../../src/utils/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const BIN = join(PROJECT_ROOT, 'bin/sova.js');
const JS_FIXTURE = join(PROJECT_ROOT, 'tests/fixtures/javascript');

/** Run a command, return { stdout, stderr, exitCode } without throwing */
function runSafe(cmd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', cwd: PROJECT_ROOT, stdio: 'pipe' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

// Ensure dist is up-to-date before running CLI smoke tests
beforeAll(() => {
  if (!existsSync(join(PROJECT_ROOT, 'dist/cli.js'))) {
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }
}, 60_000);

describe('CLI smoke tests', () => {
  it('-V / --version exits 0 and prints version string', () => {
    const result = runSafe(`node "${BIN}" -V`);
    expect(result.exitCode).toBe(0);
    // Should print something like "1.0.0"
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it('scan --path <fixture> --quiet exits 0', () => {
    const result = runSafe(`node "${BIN}" scan --path "${JS_FIXTURE}" --project test-slug --quiet`);
    expect(result.exitCode).toBe(0);
  });

  it('scan --path <fixture> --output <tmpfile> --quiet exits 0 and creates output file', () => {
    const tmpFile = join(tmpdir(), `sova-cli-test-${Date.now()}.json`);
    try {
      const result = runSafe(
        `node "${BIN}" scan --path "${JS_FIXTURE}" --project test-slug --output "${tmpFile}" --quiet`,
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(tmpFile)).toBe(true);
    } finally {
      if (existsSync(tmpFile)) rmSync(tmpFile);
    }
  });

  it('scan output file contains valid JSON manifest', () => {
    const tmpFile = join(tmpdir(), `sova-cli-manifest-${Date.now()}.json`);
    try {
      runSafe(`node "${BIN}" scan --path "${JS_FIXTURE}" --project test-slug --output "${tmpFile}" --quiet`);
      expect(existsSync(tmpFile)).toBe(true);

      const content = readFileSync(tmpFile, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.version).toBe(SOVA_VERSION);
      expect(manifest.tool?.name).toBe('@securenexus/sova');
      expect(Array.isArray(manifest.files)).toBe(true);
    } finally {
      if (existsSync(tmpFile)) rmSync(tmpFile);
    }
  });

  it('scan --path <nonexistent> exits non-zero', () => {
    const result = runSafe(
      `node "${BIN}" scan --path "/nonexistent/path/does/not/exist" --project test-slug --quiet`,
    );
    // The CLI calls process.exit(1) when directory not found
    expect(result.exitCode).not.toBe(0);
  });

  it('scan with --languages javascript only scans JS', () => {
    const tmpFile = join(tmpdir(), `sova-cli-lang-${Date.now()}.json`);
    try {
      const result = runSafe(
        `node "${BIN}" scan --path "${JS_FIXTURE}" --project test-slug --languages javascript --output "${tmpFile}" --quiet`,
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(tmpFile)).toBe(true);

      const manifest = JSON.parse(readFileSync(tmpFile, 'utf-8'));
      expect(manifest.scan.languagesDetected).toContain('javascript');
      expect(manifest.scan.languagesDetected).not.toContain('python');
    } finally {
      if (existsSync(tmpFile)) rmSync(tmpFile);
    }
  });
});

describe('CLI --project flag (optional)', () => {
  it('scan without --project succeeds (flag is optional)', () => {
    const result = runSafe(`node "${BIN}" scan --path "${JS_FIXTURE}" --quiet`);
    expect(result.exitCode).toBe(0);
  });

  it('scan with --project tag exits 0', () => {
    const tmpFile = join(tmpdir(), `sova-cli-project-${Date.now()}.json`);
    try {
      const result = runSafe(
        `node "${BIN}" scan --path "${JS_FIXTURE}" --project test-slug --output "${tmpFile}" --quiet`,
      );
      expect(result.exitCode).toBe(0);
    } finally {
      if (existsSync(tmpFile)) rmSync(tmpFile);
    }
  });
});
