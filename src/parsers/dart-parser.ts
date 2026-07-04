/**
 * DartParser - Parse Dart/Flutter dependency files.
 *
 * Supported files:
 *  - pubspec.yaml (dependencies, dev_dependencies)
 *  - pubspec.lock (packages map with version and dependency info)
 */

import { parse as parseYaml } from 'yaml';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';
import { SCOPE_MAPS } from './scope-mapping.js';

export class DartParser extends BaseParser {
  supportedLanguages = ['dart'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('pubspec.yaml')) return this.parsePubspecYaml(filePath);
      if (lower.endsWith('pubspec.lock')) return this.parsePubspecLock(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'pub');
  }

  // ── pubspec.yaml ──────────────────────────────────────────────

  private parsePubspecYaml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pub', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch {
      return result;
    }
    if (!data) return result;

    // Extract project metadata
    result.projectName = String(data['name'] || '');
    result.projectVersion = String(data['version'] || '');

    const apps: Application[] = [];

    for (const mapping of SCOPE_MAPS.pub) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope;
      const sectionDeps = data[section] as Record<string, unknown> | undefined;
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;

      for (const [pkg, spec] of Object.entries(sectionDeps)) {
        // Skip SDK references
        if (pkg === 'flutter' || pkg === 'flutter_test' || pkg === 'flutter_localizations') continue;

        let version = '';

        if (typeof spec === 'string') {
          // Simple version constraint: "^1.0.0"
          version = this.extractDartVersion(spec);
        } else if (spec && typeof spec === 'object') {
          const s = spec as Record<string, unknown>;
          // Hosted package with version
          if (s['version']) {
            version = this.extractDartVersion(String(s['version']));
          }
          // Skip git/path/sdk-only dependencies (no version)
          else if (s['git'] || s['path'] || s['sdk']) {
            continue;
          }
        } else if (spec === null || spec === undefined) {
          // No version specified (e.g., "cupertino_icons:")
          version = '';
        } else {
          continue;
        }

        apps.push(this.makeApplication(pkg, version, scope, 'pub', rawScope ?? section));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── pubspec.lock ──────────────────────────────────────────────

  private parsePubspecLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pub', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch {
      return result;
    }
    if (!data) return result;

    const packages = data['packages'] as Record<string, Record<string, unknown>> | undefined;
    if (!packages || typeof packages !== 'object') return result;

    const apps: Application[] = [];
    const adjacency: Record<string, string[]> = {};

    // Pass 1: Collect resolved versions
    const resolvedVersions: Record<string, string> = {};
    for (const [pkgName, pkgInfo] of Object.entries(packages)) {
      if (!pkgInfo || typeof pkgInfo !== 'object') continue;
      const version = String(pkgInfo['version'] || '');
      if (version) {
        resolvedVersions[pkgName.toLowerCase()] = version;
      }
    }

    // Pass 2: Extract dependencies and build tree
    for (const [pkgName, pkgInfo] of Object.entries(packages)) {
      if (!pkgInfo || typeof pkgInfo !== 'object') continue;

      const version = String(pkgInfo['version'] || '');
      if (!version) continue;

      // Build tree from dependency field
      const depType = String(pkgInfo['dependency'] || '');
      const isDev = depType === 'direct dev';
      const scope: Application['scope'] = isDev ? 'dev' : 'runtime';
      const rawScope = depType || undefined;

      const app = this.makeApplication(pkgName, version, scope, 'pub', rawScope);
      apps.push(app);

      // Some lock formats include 'dependencies' for each package
      const pkgDeps = pkgInfo['dependencies'] as Record<string, string> | undefined;
      if (pkgDeps && typeof pkgDeps === 'object') {
        const children: string[] = [];
        for (const [childName, childConstraint] of Object.entries(pkgDeps)) {
          const childVersion = resolvedVersions[childName.toLowerCase()]
            || this.extractDartVersion(String(childConstraint));
          children.push(this.generateKey(childName, childVersion));
        }
        if (children.length > 0) {
          adjacency[app.key] = children;
        }
      }
    }

    result.dependencies = apps;
    result.additionalDependencies = adjacency;
    return result;
  }

  /**
   * Extract version from a Dart/Pub version constraint.
   * Handles: ^1.0.0, >=1.0.0 <2.0.0, any
   */
  private extractDartVersion(constraint: string): string {
    if (!constraint || constraint === 'any') return '';

    // Strip operators
    const cleaned = constraint.replace(/[~^>=<!]+\s*/g, '').trim();

    // Take first version-like part
    const match = cleaned.match(/([\d]+(?:\.[\d]+)*(?:[+\-][\w.]+)?)/);
    return match ? match[1] : '';
  }
}
