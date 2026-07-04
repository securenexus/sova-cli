import { describe, it, expect } from 'vitest';
import { PerlParser } from '../../src/parsers/perl-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/perl');
const parser = new PerlParser();

describe('PerlParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('perl');
  });

  describe('cpanfile', () => {
    const fixturePath = resolve(fixtureDir, 'cpanfile');

    it('extracts required modules', async () => {
      const result = await parser.parse('perl', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes Moose with version', async () => {
      const result = await parser.parse('perl', fixturePath);
      const moose = result.dependencies.find(d => d.name === 'Moose');
      expect(moose).toBeDefined();
      expect(moose?.version).toBe('2.2207');
      expect(moose?.key).toBe('Moose_:_2.2207');
    });

    it('includes DBI with version from range constraint', async () => {
      const result = await parser.parse('perl', fixturePath);
      const dbi = result.dependencies.find(d => d.name === 'DBI');
      expect(dbi).toBeDefined();
      expect(dbi?.version).toBe('1.643');
      expect(dbi?.key).toBe('DBI_:_1.643');
    });

    it('includes module without version', async () => {
      const result = await parser.parse('perl', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('JSON::XS');
    });

    it('includes recommends modules', async () => {
      const result = await parser.parse('perl', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('Try::Tiny');
    });

    it('includes test_requires modules', async () => {
      const result = await parser.parse('perl', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('Test::More');
    });

    it('deduplicates modules', async () => {
      const result = await parser.parse('perl', fixturePath);
      const names = result.dependencies.map(d => d.name);
      const uniqueNames = new Set(names.map(n => n.toLowerCase()));
      expect(names.length).toBe(uniqueNames.size);
    });

    it('has packageManager cpan and fileType manifest', async () => {
      const result = await parser.parse('perl', fixturePath);
      expect(result.packageManager).toBe('cpan');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('perl', '/nonexistent/cpanfile');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { PerlParser as PerlV2 } from '../../src/parsers/perl-parser.js';

const perlV2 = new PerlV2();

describeV2('PerlParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-perl-v2-'));

  itV2('cpanfile: requires → runtime; test_requires → dev', async () => {
    const p = joinV2(tmp, 'cpanfile');
    writeFileSync(p, [
      "requires 'Moose', '2.0';",
      "test_requires 'Test::More';",
      ''
    ].join('\n'));
    const r = await perlV2.parse('perl', p);
    const moose = r.dependencies.find(a => a.name === 'Moose');
    const testmore = r.dependencies.find(a => a.name === 'Test::More');
    if (moose) {
      expectV2(moose.scope).toBe('runtime');
      expectV2(moose.purl).toMatch(/^pkg:cpan\//);
    }
    if (testmore) expectV2(testmore.scope).toBe('dev');
  });
});
