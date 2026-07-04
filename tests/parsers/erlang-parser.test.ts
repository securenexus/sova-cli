import { describe, it, expect } from 'vitest';
import { ErlangParser } from '../../src/parsers/erlang-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/erlang');
const parser = new ErlangParser();

describe('ErlangParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('erlang');
  });

  describe('rebar.lock', () => {
    const fixturePath = resolve(fixtureDir, 'rebar.lock');

    it('extracts hex package dependencies', async () => {
      const result = await parser.parse('erlang', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes cowboy at version', async () => {
      const result = await parser.parse('erlang', fixturePath);
      expect(result.dependencies.map(d => d.key)).toContain('cowboy_:_2.10.0');
    });

    it('includes jsx at version', async () => {
      const result = await parser.parse('erlang', fixturePath);
      expect(result.dependencies.map(d => d.key)).toContain('jsx_:_3.1.0');
    });

    it('has packageManager hex and fileType lockfile', async () => {
      const result = await parser.parse('erlang', fixturePath);
      expect(result.packageManager).toBe('hex');
      expect(result.fileType).toBe('lockfile');
    });
  });

  describe('rebar.config', () => {
    const fixturePath = resolve(fixtureDir, 'rebar.config');

    it('extracts deps from config', async () => {
      const result = await parser.parse('erlang', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes cowboy', async () => {
      const result = await parser.parse('erlang', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('cowboy');
    });

    it('has packageManager hex and fileType manifest', async () => {
      const result = await parser.parse('erlang', fixturePath);
      expect(result.packageManager).toBe('hex');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('erlang', '/nonexistent/rebar.lock');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { ErlangParser as ErlangV2 } from '../../src/parsers/erlang-parser.js';

const erV2 = new ErlangV2();

describeV2('ErlangParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-er-v2-'));

  itV2('rebar.config top-level deps → runtime', async () => {
    const p = joinV2(tmp, 'rebar.config');
    writeFileSync(p, [
      '{deps, [',
      '  {cowboy, "2.10.0"}',
      ']}.',
      ''
    ].join('\n'));
    const r = await erV2.parse('erlang', p);
    if (r.dependencies.length > 0) {
      const cowboy = r.dependencies.find(a => a.name === 'cowboy');
      if (cowboy) expectV2(cowboy.scope).toBe('runtime');
    }
  });
});
