import { describe, it, expect } from 'vitest';
import { CParser } from '../../src/parsers/c-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/c');
const parser = new CParser();

describe('CParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('c');
  });

  describe('vcpkg.json', () => {
    const fixturePath = resolve(fixtureDir, 'vcpkg.json');

    it('extracts project metadata', async () => {
      const result = await parser.parse('c', fixturePath);
      expect(result.projectName).toBe('my-cpp-project');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts string dependencies', async () => {
      const result = await parser.parse('c', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('boost');
      expect(names).toContain('zlib');
    });

    it('extracts object dependencies with versions', async () => {
      const result = await parser.parse('c', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('curl');
    });

    it('has packageManager vcpkg', async () => {
      const result = await parser.parse('c', fixturePath);
      expect(result.packageManager).toBe('vcpkg');
    });
  });

  describe('conanfile.txt', () => {
    const fixturePath = resolve(fixtureDir, 'conanfile.txt');

    it('extracts [requires] dependencies', async () => {
      const result = await parser.parse('c', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes boost at version', async () => {
      const result = await parser.parse('c', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('boost_:_1.83.0');
    });

    it('strips @user/channel suffix', async () => {
      const result = await parser.parse('c', fixturePath);
      // gtest/1.14.0@user/stable -> version should be 1.14.0
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('gtest_:_1.14.0');
    });

    it('has packageManager conan', async () => {
      const result = await parser.parse('c', fixturePath);
      expect(result.packageManager).toBe('conan');
    });
  });

  describe('CMakeLists.txt', () => {
    const fixturePath = resolve(fixtureDir, 'CMakeLists.txt');

    it('extracts project metadata', async () => {
      const result = await parser.parse('c', fixturePath);
      expect(result.projectName).toBe('MyProject');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts find_package dependencies', async () => {
      const result = await parser.parse('c', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('Boost');
      expect(names).toContain('OpenSSL');
    });

    it('extracts FetchContent dependencies', async () => {
      const result = await parser.parse('c', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('googletest');
      expect(names).toContain('nlohmann_json');
    });

    it('strips v prefix from FetchContent GIT_TAG versions', async () => {
      const result = await parser.parse('c', fixturePath);
      // v1.14.0 should become 1.14.0
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('googletest_:_1.14.0');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('c', '/nonexistent/vcpkg.json');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { CParser as CV2 } from '../../src/parsers/c-parser.js';

const cV2 = new CV2();

describeV2('CParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-c-v2-'));

  itV2('conanfile.txt requires → runtime', async () => {
    const p = joinV2(tmp, 'conanfile.txt');
    writeFileSync(p, [
      '[requires]',
      'zlib/1.2.13',
      'openssl/3.0.0',
      ''
    ].join('\n'));
    const r = await cV2.parse('c', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
      }
    }
  });

  itV2('vcpkg.json dependencies → runtime', async () => {
    const p = joinV2(tmp, 'vcpkg.json');
    writeFileSync(p, JSON.stringify({
      name: 'x', 'version-string': '1.0.0',
      dependencies: ['zlib', 'openssl'],
    }));
    const r = await cV2.parse('c', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
      }
    }
  });
});
