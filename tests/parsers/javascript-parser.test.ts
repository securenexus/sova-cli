import { describe, it, expect } from 'vitest';
import { JavaScriptParser } from '../../src/parsers/javascript-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/javascript');
const parser = new JavaScriptParser();

describe('JavaScriptParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('javascript');
  });

  describe('package.json', () => {
    const fixturePath = resolve(fixtureDir, 'package.json');

    it('has fileType manifest and packageManager npm', async () => {
      const result = await parser.parse('javascript', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('npm');
    });

    it('extracts project name and version', async () => {
      const result = await parser.parse('javascript', fixturePath);
      expect(result.projectName).toBe('my-app');
      expect(result.projectVersion).toBe('1.2.3');
      expect(result.license).toBe('MIT');
    });

    it('extracts dependencies from all sections', async () => {
      const result = await parser.parse('javascript', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(a => a.key);
      // production dependencies
      expect(keys).toContain('express_:_4.18.2');
      expect(keys).toContain('lodash_:_4.17.21');
      expect(keys).toContain('axios_:_1.4.0');
      // devDependencies
      expect(keys).toContain('jest_:_29.0.0');
      expect(keys).toContain('typescript_:_5.0.0');
    });

    it('returns empty additionalDependencies for manifest', async () => {
      const result = await parser.parse('javascript', fixturePath);
      expect(result.additionalDependencies).toEqual({});
    });
  });

  describe('package-lock.json (v3)', () => {
    const fixturePath = resolve(fixtureDir, 'package-lock.json');

    it('has fileType lockfile and packageManager npm', async () => {
      const result = await parser.parse('javascript', fixturePath);
      expect(result.fileType).toBe('lockfile');
      expect(result.packageManager).toBe('npm');
    });

    it('extracts dependencies from packages field', async () => {
      const result = await parser.parse('javascript', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('express_:_4.18.2');
      expect(keys).toContain('lodash_:_4.17.21');
      expect(keys).toContain('accepts_:_1.3.8');
    });

    it('extracts dependency tree in additionalDependencies', async () => {
      const result = await parser.parse('javascript', fixturePath);
      // express depends on accepts
      const expressKey = 'express_:_4.18.2';
      expect(result.additionalDependencies).toHaveProperty(expressKey);
      expect(result.additionalDependencies[expressKey]).toContain('accepts_:_1.3.8');
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent package.json', async () => {
      const result = await parser.parse('javascript', '/nonexistent/package.json');
      expect(result.dependencies).toEqual([]);
    });

    it('returns empty dependencies for nonexistent package-lock.json', async () => {
      const result = await parser.parse('javascript', '/nonexistent/package-lock.json');
      expect(result.dependencies).toEqual([]);
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('javascript', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('npm');
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { JavaScriptParser as JavaScriptParserV2 } from '../../src/parsers/javascript-parser.js';

const parserV2 = new JavaScriptParserV2();
const tmpV2 = mkdtempSync(joinV2(tmpdirV2(), 'sova-js-v2-'));

function writePkgV2(name: string, content: object): string {
  const dir = joinV2(tmpV2, name);
  mkdirSync(dir, { recursive: true });
  const path = joinV2(dir, 'package.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describeV2('JavaScriptParser v2 — package.json', () => {
  itV2('engines.node is NOT a dependency, lives in result.engines', async () => {
    const path = writePkgV2('pkg-engines-only', {
      name: 'x', version: '1.0.0',
      engines: { node: '>=18.0.0' },
    });
    const r = await parserV2.parse('javascript', path);
    expectV2(r.dependencies).toEqual([]);
    expectV2(r.engines).toEqual([{ name: 'node', constraint: '>=18.0.0' }]);
  });

  itV2('all 4 sections produce correctly-scoped Applications, no phantom node entry', async () => {
    const path = writePkgV2('pkg-all-sections', {
      name: 'x', version: '1.0.0',
      dependencies: { chalk: '5.3.0' },
      devDependencies: { typescript: '5.5.4' },
      peerDependencies: { react: '18.0.0' },
      optionalDependencies: { fsevents: '2.3.0' },
      engines: { node: '>=18.0.0' },
    });
    const r = await parserV2.parse('javascript', path);
    expectV2(r.dependencies).toHaveLength(4);
    expectV2(r.dependencies.find(a => a.name === 'chalk')?.scope).toBe('runtime');
    expectV2(r.dependencies.find(a => a.name === 'typescript')?.scope).toBe('dev');
    expectV2(r.dependencies.find(a => a.name === 'react')?.scope).toBe('peer');
    expectV2(r.dependencies.find(a => a.name === 'fsevents')?.scope).toBe('optional');
    expectV2(r.dependencies.find(a => a.name === 'node')).toBeUndefined();
    expectV2(r.engines).toEqual([{ name: 'node', constraint: '>=18.0.0' }]);
  });

  itV2('emits PURL for scoped package', async () => {
    const path = writePkgV2('pkg-scoped', {
      name: 'x', version: '1.0.0',
      devDependencies: { '@types/node': '22.5.0' },
    });
    const r = await parserV2.parse('javascript', path);
    expectV2(r.dependencies[0].purl).toBe('pkg:npm/%40types/node@22.5.0');
  });

  itV2('rawScope preserves original section name', async () => {
    const path = writePkgV2('pkg-raw', {
      name: 'x', version: '1.0.0',
      devDependencies: { ts: '5.0.0' },
    });
    const r = await parserV2.parse('javascript', path);
    expectV2(r.dependencies[0].rawScope).toBe('devDependencies');
  });
});
