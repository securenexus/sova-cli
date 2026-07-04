/**
 * BaseParser - Abstract base class for all dependency parsers.
 *
 * Provides shared functionality:
 * - Version normalization and extraction
 * - Package name normalization
 * - Standardized key generation ("package_:_version")
 * - File reading with encoding fallback
 */

import { readFileSync } from 'node:fs';
import type { Application, RuntimeConstraint, ParsedResult, IParser, VersionConstraint } from '../types/parser.js';
import { buildPurl } from './purl-builder.js';

const GIT_HASH_RE = /^[0-9a-f]{7,40}$/i;
const VERSION_PATTERN = /[\d.]+[\w]?/g;

export abstract class BaseParser implements IParser {
  abstract supportedLanguages: string[];

  abstract parse(language: string, filePath: string): Promise<ParsedResult>;

  /**
   * Generate standardized dependency key: "package_:_version"
   */
  generateKey(pkg: string, version: string): string {
    const normVersion = this.normalizeVersion(version);
    const normPackage = this.normalizePackage(pkg);
    return `${normPackage}_:_${normVersion}`;
  }

  /**
   * Clean and normalize version string.
   * Removes constraint operators, normalizes wildcards, filters git hashes.
   */
  normalizeVersion(version: string): string {
    if (!version) return '';

    let v = String(version).trim();

    // Remove common version constraint operators
    for (const char of ['^', '~', '>', '<', '=', ' ']) {
      v = v.split(char).join('');
    }

    // Normalize wildcards
    v = v.replace(/x/gi, '0');

    if (v.endsWith('*')) {
      v = v.replace(/\*+$/, '') + '0';
    }

    // Detect git commit hashes (hex-only, no dots, 7-40 chars)
    if (!v.includes('.') && GIT_HASH_RE.test(v)) {
      return '';
    }

    return v;
  }

  /**
   * Clean and normalize package name.
   * Handles node_modules paths. Preserves @ for scoped packages.
   */
  normalizePackage(pkg: string): string {
    if (!pkg) return '';

    let p = String(pkg).trim();

    // Remove node_modules prefix
    if (p.includes('node_modules/')) {
      p = p.split('node_modules/').pop() || p;
    }

    return p;
  }

  protected makeApplication(
    pkg: string,
    version: string,
    scope: Application['scope'],
    packageManager: string,
    rawScope?: string,
  ): Application {
    const normName = this.normalizePackage(pkg);
    const normVersion = this.normalizeVersion(version);
    return {
      name: normName,
      version: normVersion,
      scope,
      rawScope,
      purl: buildPurl(packageManager, normName, normVersion),
      key: this.generateKey(pkg, version),
    };
  }

  /**
   * Extract version from a constraint string.
   */
  extractLowerBoundVersion(constraint: string, useLowerBound = true): string | null {
    if (!constraint) return null;

    const versions = constraint.match(VERSION_PATTERN);
    if (!versions || versions.length === 0) return null;

    let version = useLowerBound ? versions[0] : versions[versions.length - 1];

    // Handle .x wildcards
    if (/\.x/i.test(version)) {
      const dotCount = (version.match(/\./g) || []).length;
      if (dotCount === 1) {
        version = version.replace(/\.x/i, '.0.0');
      } else if (dotCount >= 2) {
        version = version.replace(/\.x/i, '.0');
      }
    }

    return version;
  }

  /**
   * Parse a version constraint into components.
   */
  parseVersionConstraint(constraint: string): VersionConstraint {
    if (!constraint) return {};

    const c = constraint.trim();
    const result: VersionConstraint = {};

    // Exact version (no operators)
    if (!['^', '~', '>', '<', '=', '-', '||', ' '].some(op => c.includes(op))) {
      result.exact = c;
      return result;
    }

    // Range: "1.0.0 - 2.0.0"
    if (c.includes(' - ')) {
      const parts = c.split(' - ');
      if (parts.length === 2) {
        result.min = parts[0].trim();
        result.max = parts[1].trim();
      }
      return result;
    }

    // Operators
    const geMatch = c.match(/>=\s*([\d.]+)/);
    if (geMatch) result.min = geMatch[1];

    const leMatch = c.match(/<=\s*([\d.]+)/);
    if (leMatch) result.max = leMatch[1];

    const gtMatch = c.match(/(?<!>)>\s*([\d.]+)/);
    if (gtMatch && !c.includes('>=')) result.minExclusive = gtMatch[1];

    const ltMatch = c.match(/(?<!<)<\s*([\d.]+)/);
    if (ltMatch && !c.includes('<=')) result.maxExclusive = ltMatch[1];

    // Caret: compatible with version
    if (c.startsWith('^')) {
      const v = c.slice(1).trim();
      result.compatible = v;
      result.min = v;
    }

    // Tilde: approximately equivalent
    if (c.startsWith('~')) {
      const v = c.slice(1).trim();
      result.approximate = v;
      result.min = v;
    }

    return result;
  }

  /**
   * Check if a dependency has valid data.
   */
  isValidDependency(pkg: string, _version: string): boolean {
    return !!(pkg && pkg.trim());
  }

  /**
   * Read file lines with encoding fallback (utf-8 → latin-1).
   */
  readFileLines(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return content.split('\n');
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('encoding')) {
        try {
          const content = readFileSync(filePath, 'latin1');
          return content.split('\n');
        } catch {
          return [];
        }
      }
      return [];
    }
  }

  /**
   * Read entire file content as string.
   */
  readFileContent(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('encoding')) {
        try {
          return readFileSync(filePath, 'latin1');
        } catch {
          return '';
        }
      }
      return '';
    }
  }

  /**
   * Create an empty ParsedResult for error/empty cases.
   */
  createEmptyResult(filePath: string, packageManager = '', fileType: 'manifest' | 'lockfile' = 'manifest'): ParsedResult {
    return {
      dependencies: [],
      additionalDependencies: {},
      engines: [],
      projectName: '',
      projectVersion: '',
      license: '',
      pathToParsedFile: filePath,
      fileType,
      packageManager,
    };
  }
}
