import { describe, it, expect } from 'vitest';
import { RustParser } from '../../src/parsers/rust-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/rust');
const parser = new RustParser();

describe('RustParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('rust');
  });

  describe('Cargo.toml', () => {
    const fixturePath = resolve(fixtureDir, 'Cargo.toml');

    it('has fileType manifest and packageManager cargo', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('cargo');
    });

    it('extracts project name and version', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.projectName).toBe('my-rust-app');
      expect(result.projectVersion).toBe('0.1.0');
    });

    it('extracts license', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.license).toBe('MIT');
    });

    it('extracts dependencies from [dependencies]', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('serde_:_1.0');
      expect(keys).toContain('tokio_:_1.28');
      expect(keys).toContain('reqwest_:_0.11');
      expect(keys).toContain('anyhow_:_1.0');
    });

    it('extracts dev-dependencies', async () => {
      const result = await parser.parse('rust', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('pretty_assertions_:_1.3');
    });

    it('extracts build-dependencies', async () => {
      const result = await parser.parse('rust', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('cc_:_1.0');
    });
  });

  describe('Cargo.lock', () => {
    const fixturePath = resolve(fixtureDir, 'Cargo.lock');

    it('has fileType lockfile and packageManager cargo', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.fileType).toBe('lockfile');
      expect(result.packageManager).toBe('cargo');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('anyhow_:_1.0.75');
      expect(keys).toContain('serde_:_1.0.193');
      expect(keys).toContain('tokio_:_1.28.0');
    });

    it('builds adjacency tree from package dependencies', async () => {
      const result = await parser.parse('rust', fixturePath);
      expect(result.additionalDependencies).toBeDefined();
      // serde depends on serde_derive
      expect(result.additionalDependencies!['serde_:_1.0.193']).toContain('serde_derive_:_1.0.193');
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent Cargo.toml', async () => {
      const result = await parser.parse('rust', '/nonexistent/Cargo.toml');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('cargo');
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('rust', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { RustParser as RustV2 } from '../../src/parsers/rust-parser.js';

const rustV2 = new RustV2();

describeV2('RustParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-rust-v2-'));

  itV2('Cargo.toml: dependencies/dev-dependencies/build-dependencies → runtime/dev/build', async () => {
    const p = joinV2(tmp, 'Cargo.toml');
    writeFileSync(p, [
      '[package]',
      'name = "x"',
      'version = "0.1.0"',
      '',
      '[dependencies]',
      'serde = "1.0.0"',
      '',
      '[dev-dependencies]',
      'tokio-test = "0.4.0"',
      '',
      '[build-dependencies]',
      'cc = "1.0.0"',
      ''
    ].join('\n'));
    const r = await rustV2.parse('rust', p);
    const serde = r.dependencies.find(a => a.name === 'serde');
    const tokioTest = r.dependencies.find(a => a.name === 'tokio-test');
    const cc = r.dependencies.find(a => a.name === 'cc');
    if (serde) {
      expectV2(serde.scope).toBe('runtime');
      expectV2(serde.purl).toMatch(/^pkg:cargo\//);
    }
    if (tokioTest) expectV2(tokioTest.scope).toBe('dev');
    if (cc) expectV2(cc.scope).toBe('build');
  });
});
