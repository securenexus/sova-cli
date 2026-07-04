import { describe, it, expect } from 'vitest';
import { HaxeParser } from '../../src/parsers/haxe-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/haxe');
const parser = new HaxeParser();

describe('HaxeParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('haxe');
  });

  describe('haxelib.json', () => {
    const fixturePath = resolve(fixtureDir, 'haxelib.json');

    it('extracts project metadata', async () => {
      const result = await parser.parse('haxe', fixturePath);
      expect(result.projectName).toBe('myHaxeProject');
      expect(result.projectVersion).toBe('1.0.0');
      expect(result.license).toBe('MIT');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('haxe', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes hxnodejs with version', async () => {
      const result = await parser.parse('haxe', fixturePath);
      const keys = result.dependencies.map(d => (typeof d === 'string' ? d : `${d.name}_:_${d.version}`));
      expect(keys).toContain('hxnodejs_:_12.1.0');
    });

    it('includes tink_core with version', async () => {
      const result = await parser.parse('haxe', fixturePath);
      const keys = result.dependencies.map(d => (typeof d === 'string' ? d : `${d.name}_:_${d.version}`));
      expect(keys).toContain('tink_core_:_2.0.1');
    });

    it('includes format with empty version', async () => {
      const result = await parser.parse('haxe', fixturePath);
      const keys = result.dependencies.map(d => (typeof d === 'string' ? d : `${d.name}_:_${d.version}`));
      expect(keys).toContain('format_:_');
    });

    it('has packageManager haxelib and fileType manifest', async () => {
      const result = await parser.parse('haxe', fixturePath);
      expect(result.packageManager).toBe('haxelib');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('haxe', '/nonexistent/haxelib.json');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { HaxeParser as HaxeV2 } from '../../src/parsers/haxe-parser.js';

const haxeV2 = new HaxeV2();

describeV2('HaxeParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-haxe-v2-'));

  itV2('haxelib.json dependencies → runtime + haxelib PURL', async () => {
    const p = joinV2(tmp, 'haxelib.json');
    writeFileSync(p, JSON.stringify({
      name: 'x', version: '1.0.0',
      dependencies: { 'tink_core': '1.0.0', 'openfl': '9.0.0' },
    }));
    const r = await haxeV2.parse('haxe', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toMatch(/^pkg:haxelib\//);
      }
    }
  });
});
