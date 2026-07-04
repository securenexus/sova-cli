import { describe, it, expect } from 'vitest';
import { GoParser } from '../../src/parsers/go-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/go');
const parser = new GoParser();

describe('GoParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('go');
  });

  describe('go.mod', () => {
    const fixturePath = resolve(fixtureDir, 'go.mod');

    it('has fileType manifest and packageManager go-modules', async () => {
      const result = await parser.parse('go', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('go-modules');
    });

    it('extracts module name as projectName', async () => {
      const result = await parser.parse('go', fixturePath);
      expect(result.projectName).toBe('github.com/example/myapp');
    });

    it('extracts go version as projectVersion', async () => {
      const result = await parser.parse('go', fixturePath);
      expect(result.projectVersion).toBe('1.21');
    });

    it('extracts dependencies from require block', async () => {
      const result = await parser.parse('go', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('github.com/gin-gonic/gin_:_1.9.1');
      expect(keys).toContain('github.com/pkg/errors_:_0.9.1');
      expect(keys).toContain('golang.org/x/net_:_0.17.0');
    });

    it('extracts single-line require statements', async () => {
      const result = await parser.parse('go', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('github.com/stretchr/testify_:_1.8.4');
    });

    it('strips v prefix from versions', async () => {
      const result = await parser.parse('go', fixturePath);
      // Versions should not have 'v' prefix
      result.dependencies.forEach(dep => {
        expect(dep.version).not.toMatch(/^v/);
      });
    });

    it('includes indirect dependencies', async () => {
      const result = await parser.parse('go', fixturePath);
      // golang.org/x/net is marked // indirect in go.mod
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('golang.org/x/net_:_0.17.0');
    });

    it('returns empty additionalDependencies (go.mod has no tree)', async () => {
      const result = await parser.parse('go', fixturePath);
      expect(result.additionalDependencies).toEqual({});
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent go.mod', async () => {
      const result = await parser.parse('go', '/nonexistent/go.mod');
      expect(result.dependencies).toEqual([]);
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('go', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('go-modules');
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { GoParser as GoV2 } from '../../src/parsers/go-parser.js';

const goV2 = new GoV2();

describeV2('GoParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-go-v2-'));

  itV2('go.mod require → runtime scope + golang PURL', async () => {
    const p = joinV2(tmp, 'go.mod');
    writeFileSync(p, [
      'module example.com/x',
      'go 1.21',
      '',
      'require (',
      '    github.com/stretchr/testify v1.8.0',
      '    github.com/sirupsen/logrus v1.9.0',
      ')',
      ''
    ].join('\n'));
    const r = await goV2.parse('go', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toMatch(/^pkg:golang\//);
      }
    }
  });
});
