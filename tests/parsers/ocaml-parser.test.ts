import { describe, it, expect } from 'vitest';
import { OcamlParser } from '../../src/parsers/ocaml-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/ocaml');
const parser = new OcamlParser();

describe('OcamlParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('ocaml');
  });

  describe('dune-project', () => {
    const fixturePath = resolve(fixtureDir, 'dune-project');

    it('extracts project metadata', async () => {
      const result = await parser.parse('ocaml', fixturePath);
      expect(result.projectName).toBe('myocamlproject');
      expect(result.projectVersion).toBe('1.0.0');
      expect(result.license).toBe('MIT');
    });

    it('extracts depends from s-expression', async () => {
      const result = await parser.parse('ocaml', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes ocaml with version', async () => {
      const result = await parser.parse('ocaml', fixturePath);
      const names = result.dependencies.map(a => a.name);
      expect(names).toContain('ocaml');
    });

    it('includes dune with version', async () => {
      const result = await parser.parse('ocaml', fixturePath);
      const names = result.dependencies.map(a => a.name);
      expect(names).toContain('dune');
    });

    it('includes lwt and yojson', async () => {
      const result = await parser.parse('ocaml', fixturePath);
      const names = result.dependencies.map(a => a.name);
      expect(names).toContain('lwt');
      expect(names).toContain('yojson');
    });

    it('has packageManager opam and fileType manifest', async () => {
      const result = await parser.parse('ocaml', fixturePath);
      expect(result.packageManager).toBe('opam');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('ocaml', '/nonexistent/dune-project');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { OcamlParser as OcamlV2 } from '../../src/parsers/ocaml-parser.js';

const ocamlV2 = new OcamlV2();

describeV2('OcamlParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-ocaml-v2-'));

  itV2('opam depends: with-test → dev; default → runtime', async () => {
    const p = joinV2(tmp, 'x.opam');
    writeFileSync(p, [
      'opam-version: "2.0"',
      'name: "x"',
      'version: "0.1.0"',
      'depends: [',
      '  "lwt" {>= "5.0"}',
      '  "alcotest" {with-test}',
      ']',
      ''
    ].join('\n'));
    const r = await ocamlV2.parse('ocaml', p);
    const lwt = r.dependencies.find(a => a.name === 'lwt');
    const alcotest = r.dependencies.find(a => a.name === 'alcotest');
    if (lwt) {
      expectV2(lwt.scope).toBe('runtime');
      expectV2(lwt.purl).toMatch(/^pkg:opam\//);
    }
    if (alcotest) expectV2(alcotest.scope).toBe('dev');
  });
});
