/**
 * RustParser - Parse Rust/Cargo dependency files.
 *
 * Supported files:
 *  - Cargo.toml ([dependencies], [dev-dependencies], [build-dependencies])
 *  - Cargo.lock ([[package]] array with tree extraction)
 */

// SECURITY NOTE: @iarna/toml parses TOML spec without code execution; no unsafe eval paths.
// Do NOT substitute this with a TOML library that supports custom decoder callbacks without review.
import { parse as parseToml } from '@iarna/toml';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import { SCOPE_MAPS } from './scope-mapping.js';
import type { Application, ParsedResult } from '../types/parser.js';

export class RustParser extends BaseParser {
  supportedLanguages = ['rust'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('cargo.toml')) return this.parseCargoToml(filePath);
      if (lower.endsWith('cargo.lock')) return this.parseCargoLock(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'cargo');
  }

  // ── Cargo.toml ────────────────────────────────────────────────

  private parseCargoToml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cargo', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    // Extract project metadata
    const pkg = data['package'] as Record<string, unknown> | undefined;
    if (pkg) {
      result.projectName = String(pkg['name'] || '');
      result.projectVersion = String(pkg['version'] || '');
      result.license = String(pkg['license'] || '');
    }

    const apps: Application[] = [];

    // Parse top-level dependency sections via SCOPE_MAPS.cargo
    for (const mapping of SCOPE_MAPS.cargo) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope;
      const sectionDeps = data[section] as Record<string, unknown> | undefined;
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;
      this.extractCargoDeps(sectionDeps, scope, rawScope ?? section, apps);
    }

    // Target-specific dependencies: [target.'cfg(...)'.dependencies]
    const target = data['target'] as Record<string, Record<string, unknown>> | undefined;
    if (target && typeof target === 'object') {
      for (const targetConfig of Object.values(target)) {
        if (!targetConfig || typeof targetConfig !== 'object') continue;
        for (const mapping of SCOPE_MAPS.cargo) {
          const { section, scope } = mapping;
          const rawScope = (mapping as { rawScope?: string }).rawScope;
          const sectionDeps = targetConfig[section] as Record<string, unknown> | undefined;
          if (!sectionDeps || typeof sectionDeps !== 'object') continue;
          this.extractCargoDeps(sectionDeps, scope, rawScope ?? section, apps);
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract dependencies from a TOML dependency section into the apps array.
   * Handles:
   *  - Simple string version: serde = "1.0"
   *  - Table spec: serde = { version = "1.0", features = ["derive"] }
   *  - Git-only deps (no version) are skipped
   */
  private extractCargoDeps(
    section: Record<string, unknown>,
    scope: Application['scope'],
    rawScope: string,
    apps: Application[],
  ): void {
    for (const [name, spec] of Object.entries(section)) {
      let version = '';

      if (typeof spec === 'string') {
        // Simple version string
        version = spec;
      } else if (spec && typeof spec === 'object') {
        const s = spec as Record<string, unknown>;

        // Skip git-only dependencies (no version specified)
        if (s['git'] && !s['version']) continue;

        version = String(s['version'] || '');
      } else {
        continue;
      }

      // Skip entries with no version info at all
      if (!version) continue;

      apps.push(this.makeApplication(name, version, scope, 'cargo', rawScope));
    }
  }

  // ── Cargo.lock ────────────────────────────────────────────────

  private parseCargoLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cargo', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    const packages = data['package'] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(packages)) return result;

    const apps: Application[] = [];

    // Pass 1: Collect resolved versions; lockfile loses scope info → all runtime
    const resolved: Record<string, string> = {};
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      if (name && version) {
        resolved[name] = version;
        apps.push(this.makeApplication(name, version, 'runtime', 'cargo'));
      }
    }

    result.dependencies = apps;

    // Pass 2: Build adjacency from dependencies list
    const adjacency: Record<string, string[]> = {};
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      const pkgDeps = pkg['dependencies'] as string[] | undefined;
      if (!name || !version || !Array.isArray(pkgDeps)) continue;

      const parentKey = this.generateKey(name, version);
      const children: string[] = [];

      for (const depEntry of pkgDeps) {
        if (typeof depEntry !== 'string') continue;

        // Format: "name version" or "name version (registry+url)"
        const parts = depEntry.split(' ');
        const depName = parts[0];
        let depVersion = parts.length > 1 ? parts[1] : '';

        // Fall back to resolved version if not specified
        if (!depVersion && resolved[depName]) {
          depVersion = resolved[depName];
        }

        if (depName && depVersion) {
          children.push(this.generateKey(depName, depVersion));
        }
      }

      if (children.length > 0) {
        adjacency[parentKey] = children;
      }
    }

    result.additionalDependencies = adjacency;
    return result;
  }
}
