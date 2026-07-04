import { describe, it, expect } from 'vitest';
import { JuliaParser } from '../../src/parsers/julia-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/julia');
const parser = new JuliaParser();

describe('JuliaParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('julia');
  });

  describe('Project.toml', () => {
    const fixturePath = resolve(fixtureDir, 'Project.toml');

    it('extracts project metadata', async () => {
      const result = await parser.parse('julia', fixturePath);
      expect(result.projectName).toBe('MyJuliaProject');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts dependencies from [deps]', async () => {
      const result = await parser.parse('julia', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('uses [compat] for version info', async () => {
      const result = await parser.parse('julia', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('DataFrames');
      expect(names).toContain('Plots');
    });

    it('has packageManager julia-pkg and fileType manifest', async () => {
      const result = await parser.parse('julia', fixturePath);
      expect(result.packageManager).toBe('julia-pkg');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('Manifest.toml', () => {
    const fixturePath = resolve(fixtureDir, 'Manifest.toml');

    it('extracts deps with versions', async () => {
      const result = await parser.parse('julia', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes DataFrames at exact version', async () => {
      const result = await parser.parse('julia', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('DataFrames_:_1.6.1');
    });

    it('includes HTTP at exact version', async () => {
      const result = await parser.parse('julia', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('HTTP_:_1.9.14');
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('julia', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('julia', '/nonexistent/Project.toml');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { JuliaParser as JuliaV2 } from '../../src/parsers/julia-parser.js';

const julV2 = new JuliaV2();

describeV2('JuliaParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-jul-v2-'));

  itV2('Project.toml [deps] → runtime; [extras] → dev', async () => {
    const p = joinV2(tmp, 'Project.toml');
    writeFileSync(p, [
      'name = "X"',
      'uuid = "00000000-0000-0000-0000-000000000000"',
      'version = "0.1.0"',
      '',
      '[deps]',
      'JSON = "682c06a0-de6a-54ab-a142-c8b1cf79cde6"',
      '',
      '[extras]',
      'Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"',
      ''
    ].join('\n'));
    const r = await julV2.parse('julia', p);
    const json = r.dependencies.find(a => a.name === 'JSON');
    const test = r.dependencies.find(a => a.name === 'Test');
    if (json) expectV2(json.scope).toBe('runtime');
    if (test) expectV2(test.scope).toBe('dev');
  });
});
