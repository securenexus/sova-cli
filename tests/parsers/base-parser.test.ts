import { describe, it, expect } from 'vitest';
import { BaseParser } from '../../src/parsers/base-parser.js';
import type { ParsedResult } from '../../src/types/parser.js';

class TestParser extends BaseParser {
  supportedLanguages = ['test'];
  async parse(_language: string, filePath: string): Promise<ParsedResult> {
    return this.createEmptyResult(filePath, 'test');
  }
}

describe('BaseParser', () => {
  const parser = new TestParser();

  describe('generateKey', () => {
    it('produces "package_:_version" format', () => {
      expect(parser.generateKey('express', '4.18.2')).toBe('express_:_4.18.2');
    });
    it('handles scoped packages', () => {
      expect(parser.generateKey('@types/node', '20.0.0')).toBe('@types/node_:_20.0.0');
    });
    it('strips node_modules prefix', () => {
      expect(parser.generateKey('node_modules/express', '4.18.2')).toBe('express_:_4.18.2');
    });
  });

  describe('normalizeVersion', () => {
    it('strips caret operator', () => {
      expect(parser.normalizeVersion('^4.18.2')).toBe('4.18.2');
    });
    it('strips tilde operator', () => {
      expect(parser.normalizeVersion('~4.18.2')).toBe('4.18.2');
    });
    it('strips >= operator', () => {
      expect(parser.normalizeVersion('>=1.0.0')).toBe('1.0.0');
    });
    it('normalizes x to 0', () => {
      expect(parser.normalizeVersion('4.x.x')).toBe('4.0.0');
    });
    it('normalizes wildcard suffix', () => {
      expect(parser.normalizeVersion('4.18.*')).toBe('4.18.0');
    });
    it('returns empty for git hashes', () => {
      expect(parser.normalizeVersion('abc1234')).toBe('');
    });
    it('returns empty for empty input', () => {
      expect(parser.normalizeVersion('')).toBe('');
    });
  });

  describe('normalizePackage', () => {
    it('preserves simple names', () => {
      expect(parser.normalizePackage('express')).toBe('express');
    });
    it('preserves scoped names', () => {
      expect(parser.normalizePackage('@types/node')).toBe('@types/node');
    });
    it('strips node_modules prefix', () => {
      expect(parser.normalizePackage('node_modules/@types/node')).toBe('@types/node');
    });
    it('returns empty for empty input', () => {
      expect(parser.normalizePackage('')).toBe('');
    });
  });

  describe('parseVersionConstraint', () => {
    it('parses exact version', () => {
      expect(parser.parseVersionConstraint('1.2.3')).toEqual({ exact: '1.2.3' });
    });
    it('parses caret range', () => {
      const result = parser.parseVersionConstraint('^1.2.3');
      expect(result.compatible).toBe('1.2.3');
      expect(result.min).toBe('1.2.3');
    });
    it('parses tilde range', () => {
      const result = parser.parseVersionConstraint('~1.2.3');
      expect(result.approximate).toBe('1.2.3');
      expect(result.min).toBe('1.2.3');
    });
    it('parses range with dash', () => {
      const result = parser.parseVersionConstraint('1.0.0 - 2.0.0');
      expect(result.min).toBe('1.0.0');
      expect(result.max).toBe('2.0.0');
    });
  });

  describe('createEmptyResult', () => {
    it('returns valid empty ParsedResult', () => {
      const result = parser.createEmptyResult('/test/file', 'npm');
      expect(result.dependencies).toEqual([]);
      expect(result.additionalDependencies).toEqual({});
      expect(result.projectName).toBe('');
      expect(result.pathToParsedFile).toBe('/test/file');
      expect(result.packageManager).toBe('npm');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('isValidDependency', () => {
    it('returns true for valid package name', () => {
      expect(parser.isValidDependency('express', '4.18.2')).toBe(true);
    });
    it('returns false for empty package name', () => {
      expect(parser.isValidDependency('', '1.0.0')).toBe(false);
    });
    it('returns false for whitespace-only name', () => {
      expect(parser.isValidDependency('   ', '1.0.0')).toBe(false);
    });
  });
});

import { describe as describeMA, it as itMA, expect as expectMA } from 'vitest';

class MakeAppTestParser extends BaseParser {
  supportedLanguages = ['test'];
  async parse(_l: string, p: string) { return this.createEmptyResult(p, 'npm'); }

  // Expose protected for testing
  public _makeApp(pkg: string, version: string, scope: any, pm: string, raw?: string) {
    // @ts-expect-error — accessing protected for test
    return this.makeApplication(pkg, version, scope, pm, raw);
  }
}

describeMA('BaseParser.makeApplication', () => {
  const p = new MakeAppTestParser();

  itMA('builds Application with normalized name + version + purl + key', () => {
    const app = p._makeApp('chalk', '^5.3.0', 'runtime', 'npm');
    expectMA(app.name).toBe('chalk');
    expectMA(app.version).toBe('5.3.0');     // ^ stripped by normalizeVersion
    expectMA(app.scope).toBe('runtime');
    expectMA(app.purl).toBe('pkg:npm/chalk@5.3.0');
    expectMA(app.key).toBe('chalk_:_5.3.0');
  });

  itMA('emits rawScope when given', () => {
    const app = p._makeApp('x', '1.0.0', 'dev', 'npm', 'devDependencies');
    expectMA(app.rawScope).toBe('devDependencies');
  });

  itMA('purl undefined for unknown package manager', () => {
    const app = p._makeApp('x', '1.0.0', 'runtime', 'unknown');
    expectMA(app.purl).toBeUndefined();
  });

  itMA('createEmptyResult includes empty engines + empty dependencies', () => {
    const r = p['createEmptyResult']('/tmp/x', 'npm');
    expectMA(r.engines).toEqual([]);
    expectMA(r.dependencies).toEqual([]);
  });
});
