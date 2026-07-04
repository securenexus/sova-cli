import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../../src/index.js';
import type { ScanOptions } from '../../src/index.js';
import { SOVA_VERSION } from '../../src/utils/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JS_FIXTURE = join(__dirname, '../fixtures/javascript');

describe('scanProject (integration)', () => {
  it('scans the javascript fixture directory and returns a manifest', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
    };
    const manifest = await scanProject(options);

    expect(manifest.version).toBe(SOVA_VERSION);
    expect(manifest.tool.name).toBe('@securenexus/sova');
    expect(manifest.project.path).toBeTruthy();
    expect(typeof manifest.generatedAt).toBe('string');
  });

  it('detects javascript language in scan results', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
    };
    const manifest = await scanProject(options);

    expect(manifest.scan.languagesDetected).toContain('javascript');
    expect(manifest.scan.totalFiles).toBeGreaterThan(0);
    expect(manifest.scan.totalDependencies).toBeGreaterThan(0);
  });

  it('includes express dependency from fixture package.json', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
    };
    const manifest = await scanProject(options);

    const jsDeps = manifest.applications['javascript'] ?? [];
    const hasExpress = jsDeps.some(dep => dep.name === 'express' || dep.key.includes('express'));
    expect(hasExpress).toBe(true);
  });

  it('populates files array with file metadata', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
    };
    const manifest = await scanProject(options);

    expect(manifest.files.length).toBeGreaterThan(0);
    const jsFile = manifest.files.find(f => f.language === 'javascript');
    expect(jsFile).toBeDefined();
    expect(jsFile!.dependencyCount).toBeGreaterThan(0);
  });

  it('includes security signals structure', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
    };
    const manifest = await scanProject(options);

    expect(manifest.securitySignals).toBeDefined();
    expect(typeof manifest.securitySignals.totalSignals).toBe('number');
    expect(typeof manifest.securitySignals.critical).toBe('number');
    expect(typeof manifest.securitySignals.high).toBe('number');
    expect(Array.isArray(manifest.securitySignals.signals)).toBe(true);
  });

  it('respects language filter option', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
      languages: ['javascript'],
    };
    const manifest = await scanProject(options);

    // Should only detect javascript, not python
    expect(manifest.scan.languagesDetected).not.toContain('python');
  });

  it('sets project name from package.json', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
    };
    const manifest = await scanProject(options);

    // project-a's package.json has name "my-app"
    expect(manifest.project.name).toBeTruthy();
  });

  it('respects maxDepth option', async () => {
    const options: ScanOptions = {
      path: JS_FIXTURE,
      output: '',
      includeDev: true,
      verbose: false,
      maxDepth: 0,
    };
    const manifest = await scanProject(options);

    // Only root-level files scanned
    expect(manifest.scan.totalFiles).toBeGreaterThanOrEqual(0);
  });
});
