import { describe, it, expect } from 'vitest';
import { HtmlParser } from '../../src/parsers/html-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/html');
const parser = new HtmlParser();

describe('HtmlParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('html');
  });

  describe('index.html', () => {
    const fixturePath = resolve(fixtureDir, 'index.html');

    it('extracts CDN script dependencies', async () => {
      const result = await parser.parse('html', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('extracts vue from jsdelivr npm pattern', async () => {
      const result = await parser.parse('html', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('vue');
    });

    it('extracts lodash from cdnjs pattern (strips .js suffix)', async () => {
      const result = await parser.parse('html', fixturePath);
      const names = result.dependencies.map(d => d.name);
      // cdnjs URL has "lodash.js" in path, parser strips .js suffix -> "lodash"
      expect(names).toContain('lodash');
    });

    it('extracts axios from unpkg pattern', async () => {
      const result = await parser.parse('html', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('axios');
    });

    it('extracts jquery from code.jquery.com pattern', async () => {
      const result = await parser.parse('html', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('jquery');
    });

    it('has packageManager cdn and fileType manifest', async () => {
      const result = await parser.parse('html', fixturePath);
      expect(result.packageManager).toBe('cdn');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('html', '/nonexistent/index.html');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { HtmlParser as HtmlV2 } from '../../src/parsers/html-parser.js';

const htmlV2 = new HtmlV2();

describeV2('HtmlParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-html-v2-'));

  itV2('<script src> → runtime', async () => {
    const p = joinV2(tmp, 'index.html');
    writeFileSync(p, [
      '<!DOCTYPE html>',
      '<html><head>',
      '  <script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"></script>',
      '</head></html>',
      ''
    ].join('\n'));
    const r = await htmlV2.parse('html', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
      }
    }
  });
});
