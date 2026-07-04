/**
 * RParser - Parse R dependency files.
 *
 * Supported files:
 *  - DESCRIPTION (Imports/Depends/Suggests/LinkingTo with optional version constraints)
 *  - renv.lock (JSON Packages map with Package and Version fields)
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe, readJsonSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';
import { SCOPE_MAPS } from './scope-mapping.js';

export class RParser extends BaseParser {
  supportedLanguages = ['r'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('description')) return this.parseDescription(filePath);
      if (lower.endsWith('renv.lock')) return this.parseRenvLock(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'cran');
  }

  // ── DESCRIPTION ──────────────────────────────────────────────

  private parseDescription(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cran', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Extract project metadata
    const packageMatch = content.match(/^Package\s*:\s*(.+)/mi);
    if (packageMatch) result.projectName = packageMatch[1].trim();

    const verMatch = content.match(/^Version\s*:\s*(.+)/mi);
    if (verMatch) result.projectVersion = verMatch[1].trim();

    const licenseMatch = content.match(/^License\s*:\s*(.+)/mi);
    if (licenseMatch) result.license = licenseMatch[1].trim();

    // Iterate scope maps for top-level fields (Imports/Depends/Suggests)
    for (const mapping of SCOPE_MAPS.cran) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope ?? section;

      const fieldValue = this.extractDescriptionField(content, section);
      if (!fieldValue) continue;

      this.collectPackageEntries(fieldValue, scope, rawScope, apps, result);
    }

    // LinkingTo: compile-time C/C++ linkage → build scope
    const linkingTo = this.extractDescriptionField(content, 'LinkingTo');
    if (linkingTo) {
      this.collectPackageEntries(linkingTo, 'build', 'LinkingTo', apps, result);
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract a multi-line field from a DESCRIPTION file.
   * Fields continue on subsequent lines that start with whitespace.
   */
  private extractDescriptionField(content: string, fieldName: string): string | null {
    const lines = content.split('\n');
    let value = '';
    let capturing = false;

    for (const line of lines) {
      if (line.match(new RegExp(`^${fieldName}\\s*:`, 'i'))) {
        // Start of the field
        const colonIdx = line.indexOf(':');
        value = line.substring(colonIdx + 1).trim();
        capturing = true;
        continue;
      }

      if (capturing) {
        // Continuation lines start with whitespace
        if (line.match(/^[ \t]/)) {
          value += ' ' + line.trim();
        } else {
          // New field; stop capturing
          break;
        }
      }
    }

    return value || null;
  }

  /**
   * Parse a comma-separated DESCRIPTION package list and append Application
   * entries. Skips the special "R" pseudo-package (a runtime constraint, not
   * a CRAN package); records it into result.engines instead.
   */
  private collectPackageEntries(
    list: string,
    scope: Application['scope'],
    rawScope: string,
    apps: Application[],
    result: ParsedResult,
  ): void {
    const entries = list.split(',');

    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed) continue;

      // Format: "packagename" or "packagename (>= 1.0.0)"
      const match = trimmed.match(/^([\w.]+)\s*(?:\(([^)]*)\))?/);
      if (!match) continue;

      const name = match[1];
      const constraint = match[2] || '';

      let version = '';
      if (constraint) {
        const verMatch = constraint.match(/([\d]+(?:\.[\d]+)*)/);
        version = verMatch ? verMatch[1] : '';
      }

      // Skip the "R" pseudo-package — capture as an engine constraint instead.
      if (name === 'R') {
        if (Array.isArray(result.engines)) {
          result.engines.push({ name: 'R', constraint: constraint || version });
        }
        continue;
      }

      apps.push(this.makeApplication(name, version, scope, 'cran', rawScope));
    }
  }

  // ── renv.lock ────────────────────────────────────────────────

  private parseRenvLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cran', 'lockfile');
    const data = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!data) return result;

    const apps: Application[] = [];

    // renv.lock has a "Packages" map
    const packages = data['Packages'] as Record<string, Record<string, unknown>> | undefined;
    if (!packages || typeof packages !== 'object') {
      // Still capture R version below
      const r0 = data['R'] as Record<string, unknown> | undefined;
      if (r0) result.projectVersion = String(r0['Version'] || '');
      return result;
    }

    for (const [_key, pkgInfo] of Object.entries(packages)) {
      if (!pkgInfo || typeof pkgInfo !== 'object') continue;

      const name = String(pkgInfo['Package'] || '');
      const version = String(pkgInfo['Version'] || '');

      if (!name) continue;
      // All lockfile entries → runtime
      apps.push(this.makeApplication(name, version, 'runtime', 'cran'));
    }

    // Extract R version info if present
    const r = data['R'] as Record<string, unknown> | undefined;
    if (r) {
      result.projectVersion = String(r['Version'] || '');
    }

    result.dependencies = apps;
    return result;
  }
}
