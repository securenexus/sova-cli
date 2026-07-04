/**
 * JuliaParser - Parse Julia dependency files.
 *
 * Supported files:
 *  - Project.toml ([deps] section for name->UUID, [compat] for versions,
 *    [extras] and [targets] for dev/test deps)
 *  - Manifest.toml ([[dep_name]] sections with version field) — all runtime
 */

import { parse as parseToml } from '@iarna/toml';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';
import { SCOPE_MAPS, type SectionMapping } from './scope-mapping.js';

export class JuliaParser extends BaseParser {
  supportedLanguages = ['julia'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('project.toml')) return this.parseProjectToml(filePath);
      if (lower.endsWith('manifest.toml')) return this.parseManifestToml(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'julia-pkg');
  }

  // ── Project.toml ─────────────────────────────────────────────

  private parseProjectToml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'julia-pkg', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    // Project metadata
    result.projectName = String(data['name'] || '');
    result.projectVersion = String(data['version'] || '');

    const apps: Application[] = [];

    // [compat] maps package name -> version constraint (used regardless of section)
    const compatSection = data['compat'] as Record<string, unknown> | undefined;

    const resolveVersion = (pkgName: string): string => {
      if (compatSection && compatSection[pkgName]) {
        const constraint = String(compatSection[pkgName]);
        return this.extractJuliaVersion(constraint);
      }
      return '';
    };

    // Iterate over scope mappings: deps -> runtime, extras -> dev, targets -> dev
    for (const mapping of SCOPE_MAPS.julia as readonly SectionMapping[]) {
      const { section, scope, rawScope } = mapping;
      const sectionData = data[section];

      if (section === 'targets') {
        // [targets] is a table of test/group -> array of package names
        // e.g., targets = { test = ["Test", "Random"] }
        if (sectionData && typeof sectionData === 'object' && !Array.isArray(sectionData)) {
          const targets = sectionData as Record<string, unknown>;
          for (const groupNames of Object.values(targets)) {
            if (!Array.isArray(groupNames)) continue;
            for (const pkgName of groupNames) {
              if (typeof pkgName !== 'string') continue;
              const version = resolveVersion(pkgName);
              apps.push(this.makeApplication(pkgName, version, scope, 'julia', rawScope));
            }
          }
        }
        continue;
      }

      // [deps] and [extras]: name -> UUID mapping
      if (sectionData && typeof sectionData === 'object' && !Array.isArray(sectionData)) {
        const tableData = sectionData as Record<string, unknown>;
        for (const pkgName of Object.keys(tableData)) {
          const version = resolveVersion(pkgName);
          apps.push(this.makeApplication(pkgName, version, scope, 'julia', rawScope));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── Manifest.toml ────────────────────────────────────────────

  private parseManifestToml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'julia-pkg', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    const apps: Application[] = [];
    const adjacency: Record<string, string[]> = {};

    // Manifest v2 has a "deps" section; v1 has top-level entries
    // v2: [[deps.PackageName]] or [deps] -> {PackageName = [{...}]}
    // v1: [[PackageName]]

    const depsRoot = (data['deps'] as Record<string, unknown>) || data;

    // Collect resolved versions first
    const resolvedVersions: Record<string, string> = {};

    for (const [pkgName, entries] of Object.entries(depsRoot)) {
      if (pkgName === 'julia_version' || pkgName === 'manifest_format') continue;

      const entryList = Array.isArray(entries) ? entries : [entries];

      for (const entry of entryList) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const version = String(e['version'] || '');
        if (version) {
          resolvedVersions[pkgName] = version;
        }
      }
    }

    // Process entries — all manifest entries are runtime
    for (const [pkgName, entries] of Object.entries(depsRoot)) {
      if (pkgName === 'julia_version' || pkgName === 'manifest_format') continue;

      const entryList = Array.isArray(entries) ? entries : [entries];

      for (const entry of entryList) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const version = String(e['version'] || '');

        const app = this.makeApplication(pkgName, version, 'runtime', 'julia');
        apps.push(app);

        // Build adjacency from deps-of-deps
        const subDeps = e['deps'] as Record<string, string> | string[] | undefined;
        if (subDeps) {
          const children: string[] = [];
          if (Array.isArray(subDeps)) {
            // v1 format: deps = ["Dep1", "Dep2"]
            for (const depName of subDeps) {
              if (typeof depName === 'string') {
                const childVer = resolvedVersions[depName] || '';
                children.push(this.generateKey(depName, childVer));
              }
            }
          } else if (typeof subDeps === 'object') {
            // v2 format: [deps] Name = "UUID"
            for (const depName of Object.keys(subDeps)) {
              const childVer = resolvedVersions[depName] || '';
              children.push(this.generateKey(depName, childVer));
            }
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
   * Extract version from Julia compat string.
   * e.g., "1.0", "1.0, 2.0" (multiple compat ranges), "0.7, 1"
   */
  private extractJuliaVersion(constraint: string): string {
    if (!constraint) return '';
    // Take the first version-like value
    const match = constraint.match(/([\d]+(?:\.[\d]+)*)/);
    return match ? match[1] : '';
  }
}
