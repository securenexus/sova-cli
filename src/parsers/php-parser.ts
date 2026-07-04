/**
 * PhpParser - Parse PHP/Composer dependency files.
 *
 * Supported files:
 *  - composer.json (require, require-dev)
 *  - composer.lock (packages, packages-dev with tree extraction)
 */

import { BaseParser } from './base-parser.js';
import { readJsonSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult, RuntimeConstraint } from '../types/parser.js';
import { SCOPE_MAPS, type SectionMapping } from './scope-mapping.js';

export class PhpParser extends BaseParser {
  supportedLanguages = ['php'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('composer.json')) return this.parseComposerJson(filePath);
      if (lower.endsWith('composer.lock')) return this.parseComposerLock(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'composer');
  }

  // ── composer.json ─────────────────────────────────────────────

  private parseComposerJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'composer', 'manifest');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    // Extract metadata
    result.projectName = String(content['name'] || '');
    result.projectVersion = String(content['version'] || '');
    result.license = Array.isArray(content['license'])
      ? (content['license'] as string[]).join(', ')
      : String(content['license'] || '');

    const apps: Application[] = [];
    const engines: RuntimeConstraint[] = [];

    for (const { section, scope, rawScope } of SCOPE_MAPS.composer as readonly SectionMapping[]) {
      const sectionDeps = content[section] as Record<string, string> | undefined;
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;

      for (const [pkg, versionConstraint] of Object.entries(sectionDeps)) {
        // PHP itself is a runtime constraint, not a package
        if (pkg === 'php') {
          engines.push({ name: 'php', constraint: String(versionConstraint || '') });
          continue;
        }
        // Skip other PHP platform requirements (extensions, libs)
        if (pkg.startsWith('ext-') || pkg.startsWith('lib-')) continue;

        const version = this.extractComposerVersion(String(versionConstraint || ''));
        apps.push(this.makeApplication(pkg, version, scope, 'composer', rawScope));
      }
    }

    result.dependencies = apps;
    result.engines = engines;
    return result;
  }

  // ── composer.lock ─────────────────────────────────────────────

  private parseComposerLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'composer', 'lockfile');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];
    const adjacency: Record<string, string[]> = {};

    // Pass 1: Collect all resolved versions
    const resolvedVersions: Record<string, string> = {};
    for (const section of ['packages', 'packages-dev']) {
      const packages = content[section] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(packages)) continue;

      for (const pkg of packages) {
        const name = String(pkg['name'] || '');
        const version = this.cleanComposerLockVersion(String(pkg['version'] || ''));
        if (name && version) {
          resolvedVersions[name.toLowerCase()] = version;
        }
      }
    }

    // Pass 2: Extract dependencies and build tree
    // composer.lock has no scope info — all entries are runtime
    for (const section of ['packages', 'packages-dev']) {
      const packages = content[section] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(packages)) continue;

      for (const pkg of packages) {
        const name = String(pkg['name'] || '');
        const version = this.cleanComposerLockVersion(String(pkg['version'] || ''));
        if (!name || !version) continue;

        const app = this.makeApplication(name, version, 'runtime', 'composer');
        apps.push(app);

        // Extract child dependencies from 'require' field
        const requires = pkg['require'] as Record<string, string> | undefined;
        if (requires && typeof requires === 'object') {
          const children: string[] = [];
          for (const [depName, depConstraint] of Object.entries(requires)) {
            // Skip platform requirements
            if (depName === 'php' || depName.startsWith('ext-') || depName.startsWith('lib-')) continue;

            const childVersion = resolvedVersions[depName.toLowerCase()]
              || this.extractComposerVersion(String(depConstraint));
            children.push(this.generateKey(depName, childVersion));
          }
          if (children.length > 0) {
            adjacency[app.key] = children;
          }
        }
      }
    }

    result.dependencies = apps;
    result.additionalDependencies = adjacency;
    return result;
  }

  /**
   * Extract a version number from a Composer constraint string.
   * Handles: ^1.0, ~2.3, >=1.0 <2.0, 1.0.*, 1.0|2.0
   */
  private extractComposerVersion(constraint: string): string {
    if (!constraint) return '';

    // Handle OR constraints: take first
    const orParts = constraint.split('||').map(s => s.trim());
    const first = orParts[0];

    // Handle range constraints: take lower bound
    const rangeParts = first.split(/\s+/);
    const target = rangeParts[0];

    // Strip operators
    return target.replace(/^[~^>=<!]+/, '').replace(/\*$/, '0').trim();
  }

  /**
   * Clean composer.lock version strings.
   * Remove 'v' prefix (e.g., "v1.2.3" → "1.2.3").
   */
  private cleanComposerLockVersion(version: string): string {
    let v = version.trim();
    if (v.startsWith('v')) {
      v = v.slice(1);
    }
    return v;
  }
}
