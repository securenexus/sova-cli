import { describe, it, expect } from 'vitest';
import { RParser } from '../../src/parsers/r-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/r');
const parser = new RParser();

describe('RParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('r');
  });

  describe('DESCRIPTION', () => {
    const fixturePath = resolve(fixtureDir, 'DESCRIPTION');

    it('extracts project metadata', async () => {
      const result = await parser.parse('r', fixturePath);
      expect(result.projectName).toBe('mypackage');
      expect(result.projectVersion).toBe('1.0.0');
      expect(result.license).toBe('MIT');
    });

    it('extracts Imports dependencies', async () => {
      const result = await parser.parse('r', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('dplyr');
      expect(names).toContain('ggplot2');
    });

    it('extracts version from constraint', async () => {
      const result = await parser.parse('r', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('dplyr_:_1.1.0');
    });

    it('skips R itself from Depends', async () => {
      const result = await parser.parse('r', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).not.toContain('R');
    });

    it('includes Suggests packages', async () => {
      const result = await parser.parse('r', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('testthat');
    });

    it('has packageManager cran and fileType manifest', async () => {
      const result = await parser.parse('r', fixturePath);
      expect(result.packageManager).toBe('cran');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('renv.lock', () => {
    const fixturePath = resolve(fixtureDir, 'renv.lock');

    it('extracts packages from Packages map', async () => {
      const result = await parser.parse('r', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes dplyr at exact version', async () => {
      const result = await parser.parse('r', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('dplyr_:_1.1.4');
    });

    it('includes R version in projectVersion', async () => {
      const result = await parser.parse('r', fixturePath);
      expect(result.projectVersion).toBe('4.3.2');
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('r', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('r', '/nonexistent/DESCRIPTION');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { RParser as RV2 } from '../../src/parsers/r-parser.js';

const rV2 = new RV2();

describeV2('RParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-r-v2-'));

  itV2('DESCRIPTION Imports → runtime; Suggests → dev', async () => {
    const p = joinV2(tmp, 'DESCRIPTION');
    writeFileSync(p, [
      'Package: x',
      'Version: 0.1.0',
      'Imports: ggplot2 (>= 3.0), dplyr',
      'Suggests: testthat',
      ''
    ].join('\n'));
    const r = await rV2.parse('r', p);
    const ggplot = r.dependencies.find(a => a.name === 'ggplot2');
    const testthat = r.dependencies.find(a => a.name === 'testthat');
    if (ggplot) {
      expectV2(ggplot.scope).toBe('runtime');
      expectV2(ggplot.purl).toMatch(/^pkg:cran\//);
    }
    if (testthat) expectV2(testthat.scope).toBe('dev');
  });
});
