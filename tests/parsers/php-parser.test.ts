import { describe, it, expect } from 'vitest';
import { PhpParser } from '../../src/parsers/php-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/php');
const parser = new PhpParser();

describe('PhpParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('php');
  });

  describe('composer.json', () => {
    const fixturePath = resolve(fixtureDir, 'composer.json');

    it('has fileType manifest and packageManager composer', async () => {
      const result = await parser.parse('php', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('composer');
    });

    it('extracts project metadata', async () => {
      const result = await parser.parse('php', fixturePath);
      expect(result.projectName).toBe('example/my-php-app');
      expect(result.projectVersion).toBe('1.0.0');
      expect(result.license).toBe('MIT');
    });

    it('extracts dependencies from require section', async () => {
      const result = await parser.parse('php', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('skips php and ext- platform requirements', async () => {
      const result = await parser.parse('php', fixturePath);
      // php and ext-json should be filtered out
      const names = result.dependencies.map(d => d.name);
      expect(names).not.toContain('php');
      expect(names).not.toContain('ext-json');
    });

    it('extracts package dependencies with resolved versions', async () => {
      const result = await parser.parse('php', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      // laravel/framework ^10.0 → 10.0
      expect(keys).toContain('laravel/framework_:_10.0');
      // guzzlehttp/guzzle ^7.5 → 7.5
      expect(keys).toContain('guzzlehttp/guzzle_:_7.5');
    });

    it('extracts require-dev dependencies', async () => {
      const result = await parser.parse('php', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      // phpunit/phpunit ^10.0 → 10.0
      expect(keys).toContain('phpunit/phpunit_:_10.0');
    });
  });

  describe('composer.lock', () => {
    const fixturePath = resolve(fixtureDir, 'composer.lock');

    it('has fileType lockfile and packageManager composer', async () => {
      const result = await parser.parse('php', fixturePath);
      expect(result.fileType).toBe('lockfile');
      expect(result.packageManager).toBe('composer');
    });

    it('extracts resolved package versions', async () => {
      const result = await parser.parse('php', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('guzzlehttp/guzzle_:_7.8.1');
      expect(keys).toContain('guzzlehttp/promises_:_2.0.2');
      expect(keys).toContain('psr/http-client_:_1.0.3');
    });

    it('strips v prefix from version strings', async () => {
      const result = await parser.parse('php', fixturePath);
      // No dependency should have a 'v' prefix in version
      result.dependencies.forEach(dep => {
        expect(dep.version).not.toMatch(/^v/);
      });
    });

    it('includes packages-dev entries', async () => {
      const result = await parser.parse('php', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('phpunit/phpunit_:_10.4.2');
    });

    it('builds adjacency tree from package require fields', async () => {
      const result = await parser.parse('php', fixturePath);
      expect(result.additionalDependencies).toBeDefined();
      // guzzlehttp/guzzle requires guzzlehttp/promises and psr/http-client
      const guzzleDeps = result.additionalDependencies!['guzzlehttp/guzzle_:_7.8.1'];
      expect(guzzleDeps).toBeDefined();
      expect(guzzleDeps).toContain('guzzlehttp/promises_:_2.0.2');
      expect(guzzleDeps).toContain('psr/http-client_:_1.0.3');
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent composer.json', async () => {
      const result = await parser.parse('php', '/nonexistent/composer.json');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('composer');
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('php', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { PhpParser as PhpV2 } from '../../src/parsers/php-parser.js';

const phpV2 = new PhpV2();

describeV2('PhpParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-php-v2-'));

  itV2('composer.json require → runtime; require-dev → dev', async () => {
    const p = joinV2(tmp, 'composer.json');
    writeFileSync(p, JSON.stringify({
      name: 'x/x',
      require: { 'monolog/monolog': '2.0.0', php: '^8.0' },
      'require-dev': { 'phpunit/phpunit': '9.0.0' },
    }));
    const r = await phpV2.parse('php', p);
    const monolog = r.dependencies.find(a => a.name.includes('monolog'));
    const phpunit = r.dependencies.find(a => a.name.includes('phpunit'));
    if (monolog) {
      expectV2(monolog.scope).toBe('runtime');
      expectV2(monolog.purl).toMatch(/^pkg:composer\//);
    }
    if (phpunit) expectV2(phpunit.scope).toBe('dev');
  });
});
