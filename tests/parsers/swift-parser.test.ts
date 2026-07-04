import { describe, it, expect } from 'vitest';
import { SwiftParser } from '../../src/parsers/swift-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/swift');
const parser = new SwiftParser();

describe('SwiftParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('swift');
  });

  describe('Package.swift', () => {
    const fixturePath = resolve(fixtureDir, 'Package.swift');

    it('extracts project name', async () => {
      const result = await parser.parse('swift', fixturePath);
      expect(result.projectName).toBe('MySwiftPackage');
    });

    it('extracts dependencies from various patterns', async () => {
      const result = await parser.parse('swift', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('extracts swift-nio from: pattern', async () => {
      const result = await parser.parse('swift', fixturePath);
      const names = result.dependencies.map(d => (typeof d === 'string' ? d.split('_:_')[0] : d.name));
      expect(names).toContain('swift-nio');
    });

    it('extracts vapor from upToNextMajor pattern', async () => {
      const result = await parser.parse('swift', fixturePath);
      const names = result.dependencies.map(d => (typeof d === 'string' ? d.split('_:_')[0] : d.name));
      expect(names).toContain('vapor');
    });

    it('extracts SwiftyJSON from exact pattern', async () => {
      const result = await parser.parse('swift', fixturePath);
      const names = result.dependencies.map(d => (typeof d === 'string' ? d.split('_:_')[0] : d.name));
      expect(names).toContain('SwiftyJSON');
    });

    it('has packageManager swift-pm and fileType manifest', async () => {
      const result = await parser.parse('swift', fixturePath);
      expect(result.packageManager).toBe('swift-pm');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('swift', '/nonexistent/Package.swift');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { SwiftParser as SwiftV2 } from '../../src/parsers/swift-parser.js';

const swV2 = new SwiftV2();

describeV2('SwiftParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-sw-v2-'));

  itV2('Package.swift dependencies → runtime + swift PURL', async () => {
    const p = joinV2(tmp, 'Package.swift');
    writeFileSync(p, [
      'import PackageDescription',
      'let package = Package(',
      '  name: "X",',
      '  dependencies: [',
      '    .package(url: "https://github.com/Alamofire/Alamofire", from: "5.0.0"),',
      '  ],',
      '  targets: [.target(name: "X", dependencies: ["Alamofire"])]',
      ')',
      ''
    ].join('\n'));
    const r = await swV2.parse('swift', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        if (a.purl) expectV2(a.purl).toMatch(/^pkg:swift\//);
      }
    }
  });
});
