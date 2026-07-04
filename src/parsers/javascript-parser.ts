/**
 * JavaScriptParser - Parse JavaScript/Node.js dependency files.
 *
 * Supported files:
 *  - package.json (dependencies, devDependencies, peerDependencies, engines)
 *  - package-lock.json / npm-shrinkwrap.json (v1/v2/v3 with tree extraction)
 *  - yarn.lock (v1 text format)
 *  - pnpm-lock.yaml (v6+ and legacy)
 *  - bower.json
 *
 * Skipped: bun.lockb (binary, needs CLI)
 */

import { basename, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { BaseParser } from './base-parser.js';
import { readFileSafe, readJsonSafe } from '../utils/file-reader.js';
import { SCOPE_MAPS } from './scope-mapping.js';
import type { Application, ParsedResult, RuntimeConstraint } from '../types/parser.js';

export class JavaScriptParser extends BaseParser {
  supportedLanguages = ['javascript'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();
    try {
      if (lower.endsWith('npm-shrinkwrap.json')) return this.parseLockJson(filePath);
      if (lower.endsWith('package-lock.json')) return this.parseLockJson(filePath);
      if (lower.endsWith('package.json')) return this.parsePackageJson(filePath);
      if (lower.endsWith('yarn.lock')) return this.parseYarnLock(filePath);
      if (lower.endsWith('bower.json')) return this.parseBowerJson(filePath);
      if (lower.endsWith('pnpm-lock.yaml')) return this.parsePnpmLock(filePath);
      if (lower.endsWith('bun.lockb')) return this.parseBunFallback(filePath);
    } catch (e) {
      // Fall through to empty result
    }
    return this.createEmptyResult(filePath, 'npm');
  }

  // ── package.json ────────────────────────────────────────────────

  private parsePackageJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'npm', 'manifest');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];

    for (const mapping of SCOPE_MAPS.npm) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope;
      const sectionDeps = content[section];
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;
      for (const [pkg, version] of Object.entries(sectionDeps as Record<string, string>)) {
        const finalVersion = this.parseVersionSpec(String(version || ''));
        apps.push(this.makeApplication(pkg, finalVersion, scope, 'npm', rawScope ?? section));
      }
    }

    // engines — runtime constraint, NOT a dependency
    const engines: RuntimeConstraint[] = [];
    if (content.engines && typeof content.engines === 'object') {
      for (const [name, constraint] of Object.entries(content.engines as Record<string, string>)) {
        engines.push({ name, constraint: String(constraint) });
      }
    }

    result.projectName = String(content['name'] || '');
    result.projectVersion = String(content['version'] || '');
    result.license = String(content['license'] || '');
    result.dependencies = apps;
    result.engines = engines;
    return result;
  }

  /**
   * Parse npm version specification to extract version.
   * Handles URLs, ranges, operators, etc.
   */
  private parseVersionSpec(version: string): string {
    if (!version) return '';
    if (version.includes('http')) return this.extractVersionFromUrl(version);
    if (version.includes(' - ')) return this.extractLowerBoundVersion(version, false) || '';
    if (version.includes('>=')) return version.split('>=').pop()!.split(' ')[0] || '';
    if (version.includes('<=')) return version.split('<=').pop()!.split(' ')[0] || '';
    if (version.includes('||')) return version.split('||').pop()!.trim().split(' ')[0] || '';
    return version;
  }

  private extractVersionFromUrl(url: string): string {
    const parts = url.split('/');
    const last = parts[parts.length - 1] || '';
    for (const ext of ['.tar.gz', '.tar', '.tgz']) {
      if (last.includes(ext)) {
        return last.split(ext)[0].split('-').pop() || '';
      }
    }
    return '';
  }

  // ── package-lock.json / npm-shrinkwrap.json ─────────────────────

  private parseLockJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'npm', 'lockfile');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];
    const hasPackages = 'packages' in content;
    const hasDependencies = 'dependencies' in content;

    // Extract flat dependency list
    if (hasDependencies) {
      const lockDeps = content['dependencies'] as Record<string, Record<string, unknown>>;
      if (lockDeps && typeof lockDeps === 'object') {
        for (const [pkg, info] of Object.entries(lockDeps)) {
          if (info && typeof info === 'object') {
            const version = String((info as Record<string, unknown>)['version'] || '');
            apps.push(this.makeApplication(pkg, version, 'runtime', 'npm'));
          }
        }
      }
    } else if (hasPackages) {
      const packages = content['packages'] as Record<string, Record<string, unknown>>;
      if (packages && typeof packages === 'object') {
        for (const [pkgPath, info] of Object.entries(packages)) {
          if (!pkgPath || !info || typeof info !== 'object') continue;
          const pkgName = this.extractPkgNameFromPath(pkgPath);
          if (!pkgName) continue;
          const version = String((info as Record<string, unknown>)['version'] || '');
          apps.push(this.makeApplication(pkgName, version, 'runtime', 'npm'));
        }
      }
    }

    result.dependencies = apps;

    // Extract tree structure
    if (hasDependencies) {
      result.additionalDependencies = this.extractTreeFromV1(content);
    } else if (hasPackages) {
      result.additionalDependencies = this.extractTreeFromV2(content);
    }

    return result;
  }

  /**
   * v1 format: dependencies.{pkg}.requires = {child: version_range}
   */
  private extractTreeFromV1(lockContent: Record<string, unknown>): Record<string, string[]> {
    const adjacency: Record<string, string[]> = {};
    const dependencies = lockContent['dependencies'] as Record<string, Record<string, unknown>> | undefined;
    if (!dependencies || typeof dependencies !== 'object') return adjacency;

    for (const [pkgName, pkgInfo] of Object.entries(dependencies)) {
      if (!pkgInfo || typeof pkgInfo !== 'object') continue;

      const version = String(pkgInfo['version'] || '');
      const requires = pkgInfo['requires'] as Record<string, string> | undefined;

      if (requires && typeof requires === 'object') {
        const parentKey = this.generateKey(pkgName, version);
        const children: string[] = [];

        for (const [childName, childVerRange] of Object.entries(requires)) {
          // Resolve actual version from top-level deps
          const childInfo = dependencies[childName] as Record<string, unknown> | undefined;
          const childVersion = (childInfo && typeof childInfo === 'object')
            ? String(childInfo['version'] || childVerRange)
            : String(childVerRange);
          children.push(this.generateKey(childName, childVersion));
        }

        if (children.length > 0) {
          adjacency[parentKey] = children;
        }
      }
    }

    return adjacency;
  }

  /**
   * v2/v3 format: packages.{path}.dependencies = {child: version_range}
   */
  private extractTreeFromV2(lockContent: Record<string, unknown>): Record<string, string[]> {
    const adjacency: Record<string, string[]> = {};
    const packages = lockContent['packages'] as Record<string, Record<string, unknown>> | undefined;
    if (!packages || typeof packages !== 'object') return adjacency;

    // Build lookup: packageName → version
    const pkgVersionLookup: Record<string, string> = {};
    for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
      if (!pkgInfo || typeof pkgInfo !== 'object') continue;
      const pkgName = this.extractPkgNameFromPath(pkgPath);
      if (pkgName) {
        pkgVersionLookup[pkgName] = String(pkgInfo['version'] || '');
      }
    }

    // Extract adjacency
    for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
      if (!pkgInfo || typeof pkgInfo !== 'object') continue;

      let pkgName = this.extractPkgNameFromPath(pkgPath);
      if (!pkgName && pkgPath === '') {
        pkgName = String((pkgInfo as Record<string, unknown>)['name'] || '');
      }
      if (!pkgName) continue;

      const parentVersion = String(pkgInfo['version'] || '');
      const parentKey = this.generateKey(pkgName, parentVersion);

      const children: string[] = [];
      for (const depSection of ['dependencies', 'optionalDependencies']) {
        const sectionDeps = pkgInfo[depSection] as Record<string, string> | undefined;
        if (!sectionDeps || typeof sectionDeps !== 'object') continue;

        for (const [childName, childVerRange] of Object.entries(sectionDeps)) {
          const childVersion = pkgVersionLookup[childName] || String(childVerRange);
          children.push(this.generateKey(childName, childVersion));
        }
      }

      if (children.length > 0) {
        adjacency[parentKey] = children;
      }
    }

    return adjacency;
  }

  /**
   * Extract package name from packages path.
   * "node_modules/express" → "express"
   * "node_modules/@types/node" → "@types/node"
   */
  private extractPkgNameFromPath(pkgPath: string): string {
    if (!pkgPath) return '';
    const parts = pkgPath.split('node_modules/');
    if (parts.length < 2) return '';
    return parts[parts.length - 1];
  }

  // ── yarn.lock ───────────────────────────────────────────────────

  private parseYarnLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'yarn', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Parse yarn.lock v1 text format
    // Format:
    // "package@^version", "package@~version":
    //   version "1.2.3"
    //   ...
    const lines = content.split('\n');
    let currentPkgNames: string[] = [];

    for (const line of lines) {
      // Package header line
      if (!line.startsWith(' ') && !line.startsWith('#') && line.includes('@') && line.endsWith(':')) {
        // Parse header: "express@^4.18.0", "express@~4.18.0":
        currentPkgNames = [];
        const headerEntries = line.slice(0, -1).split(','); // Remove trailing ":"
        for (const entry of headerEntries) {
          const clean = entry.trim().replace(/"/g, '');
          // Extract package name (everything before last @)
          if (clean.startsWith('@')) {
            // Scoped: @scope/pkg@version
            const atIdx = clean.lastIndexOf('@');
            if (atIdx > 0) {
              currentPkgNames.push(clean.substring(0, atIdx));
            }
          } else {
            const parts = clean.split('@');
            if (parts.length >= 2) {
              currentPkgNames.push(parts[0]);
            }
          }
        }
      }

      // Version line
      if (line.trimStart().startsWith('version ') && currentPkgNames.length > 0) {
        const versionMatch = line.match(/version\s+"([^"]+)"/);
        if (versionMatch) {
          const version = versionMatch[1];
          for (const pkgName of currentPkgNames) {
            const key = this.generateKey(pkgName, version);
            if (!seen.has(key)) {
              seen.add(key);
              apps.push(this.makeApplication(pkgName, version, 'runtime', 'yarn'));
            }
          }
        }
        currentPkgNames = [];
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── bower.json ──────────────────────────────────────────────────

  private parseBowerJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'bower', 'manifest');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];

    for (const mapping of SCOPE_MAPS.bower) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope;
      const sectionDeps = content[section] as Record<string, string> | undefined;
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;
      for (const [pkg, version] of Object.entries(sectionDeps)) {
        const cleanVer = this.cleanBowerVersion(String(version || ''));
        apps.push(this.makeApplication(pkg, cleanVer, scope, 'bower', rawScope ?? section));
      }
    }

    result.dependencies = apps;
    return result;
  }

  private cleanBowerVersion(version: string): string {
    if (version.includes('>=')) return version.split('>=').pop()!.split(' ')[0] || '';
    if (version.includes('<=')) return version.split('<=').pop()!.split(' ')[0] || '';
    if (version.includes('^')) return version.split('^').pop() || '';
    return version;
  }

  // ── pnpm-lock.yaml ─────────────────────────────────────────────

  private parsePnpmLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pnpm', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let pnpmContent: Record<string, unknown>;
    try {
      pnpmContent = parseYaml(content) as Record<string, unknown>;
    } catch {
      return result;
    }
    if (!pnpmContent) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Handle pnpm v6+ format with 'packages' key
    const packages = pnpmContent['packages'] as Record<string, unknown> | undefined;
    if (packages && typeof packages === 'object') {
      for (let [pkgPath, _pkgInfo] of Object.entries(packages)) {
        // Remove leading /
        if (pkgPath.startsWith('/')) pkgPath = pkgPath.slice(1);

        let packageName: string;
        let version: string;

        // Handle scoped packages: @types/node@20.0.0
        if (pkgPath.startsWith('@')) {
          const atIdx = pkgPath.lastIndexOf('@');
          if (atIdx <= 0) continue;
          packageName = pkgPath.substring(0, atIdx);
          version = pkgPath.substring(atIdx + 1);
        } else {
          const parts = pkgPath.split('@', 2);
          if (parts.length < 2) continue;
          packageName = parts[0];
          version = parts[1];
        }

        // Clean version: remove peer dep suffixes ("_@types+node@20.0.0")
        if (version.includes('_')) version = version.split('_')[0];
        version = version.replace(/[()]/g, '');

        if (this.isValidDependency(packageName, version)) {
          const key = this.generateKey(packageName, version);
          if (!seen.has(key)) {
            seen.add(key);
            apps.push(this.makeApplication(packageName, version, 'runtime', 'pnpm'));
          }
        }
      }
    }

    // Handle older pnpm format with direct dependency sections
    if (!packages) {
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        const sectionDeps = pnpmContent[section] as Record<string, unknown> | undefined;
        if (!sectionDeps || typeof sectionDeps !== 'object') continue;

        for (const [pkg, versionInfo] of Object.entries(sectionDeps)) {
          let version: string;
          if (typeof versionInfo === 'string') {
            version = versionInfo;
          } else if (versionInfo && typeof versionInfo === 'object') {
            version = String((versionInfo as Record<string, unknown>)['version'] || '');
          } else {
            continue;
          }

          if (this.isValidDependency(pkg, version)) {
            const key = this.generateKey(pkg, version);
            if (!seen.has(key)) {
              seen.add(key);
              apps.push(this.makeApplication(pkg, version, 'runtime', 'pnpm'));
            }
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── bun.lockb fallback ──────────────────────────────────────────

  private parseBunFallback(filePath: string): ParsedResult {
    // bun.lockb is binary — fall back to package.json in the same directory
    const dir = dirname(filePath);
    const pkgJsonPath = join(dir, 'package.json');
    if (existsSync(pkgJsonPath)) {
      return this.parsePackageJson(pkgJsonPath);
    }
    return this.createEmptyResult(filePath, 'bun');
  }
}
