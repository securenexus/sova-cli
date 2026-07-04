import { describe, it, expect } from 'vitest';
import { HaskellParser } from '../../src/parsers/haskell-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/haskell');
const parser = new HaskellParser();

describe('HaskellParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('haskell');
  });

  describe('myproject.cabal', () => {
    const fixturePath = resolve(fixtureDir, 'myproject.cabal');

    it('extracts project metadata', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.projectName).toBe('myproject');
      expect(result.projectVersion).toBe('1.0.0');
      expect(result.license).toBe('MIT');
    });

    it('extracts build-depends dependencies', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes base and aeson', async () => {
      const result = await parser.parse('haskell', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('base');
      expect(names).toContain('aeson');
    });

    it('has packageManager cabal and fileType manifest', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.packageManager).toBe('cabal');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('stack.yaml', () => {
    const fixturePath = resolve(fixtureDir, 'stack.yaml');

    it('extracts extra-deps', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes aeson from extra-deps', async () => {
      const result = await parser.parse('haskell', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('aeson_:_2.1.2.1');
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });
  });

  describe('package.yaml', () => {
    const fixturePath = resolve(fixtureDir, 'package.yaml');

    it('extracts project metadata', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.projectName).toBe('myproject');
    });

    it('extracts top-level and nested dependencies', async () => {
      const result = await parser.parse('haskell', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('base');
      expect(names).toContain('aeson');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('haskell', '/nonexistent/project.cabal');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { HaskellParser as HaskellV2 } from '../../src/parsers/haskell-parser.js';

const hsV2 = new HaskellV2();

describeV2('HaskellParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-hs-v2-'));

  itV2('.cabal: library build-depends → runtime; test-suite → dev', async () => {
    const p = joinV2(tmp, 'x.cabal');
    writeFileSync(p, [
      'name: x',
      'version: 0.1.0.0',
      '',
      'library',
      '  build-depends: base >= 4.0 && < 5,',
      '                 text >= 1.0',
      '  default-language: Haskell2010',
      '',
      'test-suite x-test',
      '  type: exitcode-stdio-1.0',
      '  build-depends: base, hspec',
      ''
    ].join('\n'));
    const r = await hsV2.parse('haskell', p);
    const text = r.dependencies.find(a => a.name === 'text');
    const hspec = r.dependencies.find(a => a.name === 'hspec');
    if (text) {
      expectV2(text.scope).toBe('runtime');
      expectV2(text.purl).toMatch(/^pkg:hackage\//);
    }
    if (hspec) expectV2(hspec.scope).toBe('dev');
  });
});
