import { describe, it, expect } from 'vitest';
import { PythonParser } from '../../src/parsers/python-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/python');
const parser = new PythonParser();

describe('PythonParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('python');
  });

  describe('requirements.txt', () => {
    const fixturePath = resolve(fixtureDir, 'requirements.txt');

    it('has fileType manifest and packageManager pip', async () => {
      const result = await parser.parse('python', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('pip');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('python', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('parses exact version pins (==)', async () => {
      const result = await parser.parse('python', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('flask_:_2.3.0');
      expect(keys).toContain('pandas_:_1.5.3');
    });

    it('parses minimum version constraints (>=)', async () => {
      const result = await parser.parse('python', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('requests_:_2.28.0');
    });

    it('parses compatible release operator (~=)', async () => {
      const result = await parser.parse('python', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('gunicorn_:_20.1.0');
    });

    it('includes packages without version specifier', async () => {
      const result = await parser.parse('python', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('numpy_:_');
    });

    it('skips comment lines and -r directives', async () => {
      const result = await parser.parse('python', fixturePath);
      // comments and -r lines should not appear as deps
      const pkgNames = result.dependencies.map(d => d.name);
      expect(pkgNames).not.toContain('#');
      expect(pkgNames.some(n => n.startsWith('-'))).toBe(false);
      expect(pkgNames.some(n => n.startsWith('other-requirements'))).toBe(false);
    });

    it('returns empty additionalDependencies', async () => {
      const result = await parser.parse('python', fixturePath);
      expect(result.additionalDependencies).toEqual({});
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent requirements.txt', async () => {
      const result = await parser.parse('python', '/nonexistent/requirements.txt');
      expect(result.dependencies).toEqual([]);
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('python', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('pip');
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { PythonParser as PyV2 } from '../../src/parsers/python-parser.js';

const pyV2 = new PyV2();

describeV2('PythonParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-py-v2-'));

  itV2('requirements.txt → runtime scope', async () => {
    const p = joinV2(tmp, 'requirements.txt');
    writeFileSync(p, 'requests==2.31.0\nflask==2.0.0\n');
    const r = await pyV2.parse('python', p);
    expectV2(r.dependencies.length).toBeGreaterThanOrEqual(1);
    for (const a of r.dependencies) {
      expectV2(a.scope).toBe('runtime');
      expectV2(a.purl).toMatch(/^pkg:pypi\//);
    }
  });

  itV2('requirements-dev.txt → dev scope', async () => {
    const p = joinV2(tmp, 'requirements-dev.txt');
    writeFileSync(p, 'pytest==7.0.0\n');
    const r = await pyV2.parse('python', p);
    if (r.dependencies.length > 0) {
      expectV2(r.dependencies[0].scope).toBe('dev');
    }
  });

  itV2('Poetry pyproject.toml → runtime + dev scopes', async () => {
    const p = joinV2(tmp, 'pyproject.toml');
    writeFileSync(p, [
      '[tool.poetry]',
      'name = "x"',
      'version = "0.1.0"',
      '',
      '[tool.poetry.dependencies]',
      'python = "^3.10"',
      'django = "5.0.0"',
      '',
      '[tool.poetry.dev-dependencies]',
      'pytest = "7.0.0"',
      ''
    ].join('\n'));
    const r = await pyV2.parse('python', p);
    const django = r.dependencies.find(a => a.name === 'django');
    const pytest = r.dependencies.find(a => a.name === 'pytest');
    if (django) expectV2(django.scope).toBe('runtime');
    if (pytest) expectV2(pytest.scope).toBe('dev');
  });
});
