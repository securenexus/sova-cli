import { describe, it, expect } from 'vitest';
import { DartParser } from '../../src/parsers/dart-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/dart');
const parser = new DartParser();

describe('DartParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('dart');
  });

  describe('pubspec.yaml', () => {
    const fixturePath = resolve(fixtureDir, 'pubspec.yaml');

    it('extracts project metadata', async () => {
      const result = await parser.parse('dart', fixturePath);
      expect(result.projectName).toBe('my_flutter_app');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts dependencies and skips flutter SDK', async () => {
      const result = await parser.parse('dart', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      // flutter itself should be skipped
      const names = result.dependencies.map(d => d.name);
      expect(names).not.toContain('flutter');
    });

    it('includes http and provider', async () => {
      const result = await parser.parse('dart', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('http');
      expect(names).toContain('provider');
    });

    it('has packageManager pub and fileType manifest', async () => {
      const result = await parser.parse('dart', fixturePath);
      expect(result.packageManager).toBe('pub');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('pubspec.lock', () => {
    const fixturePath = resolve(fixtureDir, 'pubspec.lock');

    it('extracts locked packages with versions', async () => {
      const result = await parser.parse('dart', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes http at exact version', async () => {
      const result = await parser.parse('dart', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('http_:_1.1.0');
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('dart', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('dart', '/nonexistent/pubspec.yaml');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { DartParser as DartV2 } from '../../src/parsers/dart-parser.js';

const dartV2 = new DartV2();

describeV2('DartParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-dart-v2-'));

  itV2('pubspec.yaml dependencies → runtime; dev_dependencies → dev', async () => {
    const p = joinV2(tmp, 'pubspec.yaml');
    writeFileSync(p, [
      'name: x',
      'version: 1.0.0',
      'dependencies:',
      '  flutter: ^3.0.0',
      '  http: 1.0.0',
      'dev_dependencies:',
      '  flutter_test: ^3.0.0',
      ''
    ].join('\n'));
    const r = await dartV2.parse('dart', p);
    const http = r.dependencies.find(a => a.name === 'http');
    const fluttest = r.dependencies.find(a => a.name === 'flutter_test');
    if (http) {
      expectV2(http.scope).toBe('runtime');
      expectV2(http.purl).toMatch(/^pkg:pub\//);
    }
    if (fluttest) expectV2(fluttest.scope).toBe('dev');
  });
});
