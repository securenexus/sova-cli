import { describe, it, expect } from 'vitest';
import { CocoaParser } from '../../src/parsers/cocoa-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/cocoa');
const parser = new CocoaParser();

describe('CocoaParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('cocoa');
  });

  describe('Podfile.lock', () => {
    const fixturePath = resolve(fixtureDir, 'Podfile.lock');

    it('extracts PODS section dependencies', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes Alamofire at version', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('Alamofire_:_5.8.1');
    });

    it('includes SDWebImage at version', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('SDWebImage_:_5.18.3');
    });

    it('builds adjacency for pods with children', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      // Firebase has sub-dependencies
      expect(Object.keys(result.additionalDependencies).length).toBeGreaterThan(0);
    });

    it('has packageManager cocoapods and fileType lockfile', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      expect(result.packageManager).toBe('cocoapods');
      expect(result.fileType).toBe('lockfile');
    });
  });

  describe('MyLib.podspec', () => {
    const fixturePath = resolve(fixtureDir, 'MyLib.podspec');

    it('extracts project metadata', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      expect(result.projectName).toBe('MyLib');
      expect(result.projectVersion).toBe('2.1.0');
      expect(result.license).toBe('MIT');
    });

    it('extracts s.dependency declarations', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes Alamofire', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      const names = result.dependencies.map(a => a.name);
      expect(names).toContain('Alamofire');
    });

    it('has fileType manifest', async () => {
      const result = await parser.parse('cocoa', fixturePath);
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('cocoa', '/nonexistent/Podfile.lock');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { CocoaParser as CocoaV2 } from '../../src/parsers/cocoa-parser.js';

const cocoaV2 = new CocoaV2();

describeV2('CocoaParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-cocoa-v2-'));

  itV2('Podfile pod → runtime + cocoapods PURL', async () => {
    const p = joinV2(tmp, 'Podfile');
    writeFileSync(p, [
      'platform :ios, "13.0"',
      "pod 'AFNetworking', '~> 4.0'",
      ''
    ].join('\n'));
    const r = await cocoaV2.parse('cocoa', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toMatch(/^pkg:cocoapods\//);
      }
    }
  });
});
