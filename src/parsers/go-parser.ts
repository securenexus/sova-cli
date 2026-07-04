/**
 * GoParser - Parse Go module dependency files (file-based only).
 *
 * Supported files:
 *  - go.mod (require blocks and single-line require)
 *  - go.sum (module version hash lines)
 *
 * Does NOT invoke `go` CLI commands.
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

export class GoParser extends BaseParser {
  supportedLanguages = ['go'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('go.mod')) return this.parseGoMod(filePath);
      if (lower.endsWith('go.sum')) return this.parseGoSum(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'go-modules');
  }

  // ── go.mod ────────────────────────────────────────────────────

  private parseGoMod(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'go-modules', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Extract module name (project name)
    const moduleMatch = content.match(/^module\s+(\S+)/m);
    if (moduleMatch) {
      result.projectName = moduleMatch[1];
    }

    // Extract go version
    const goVerMatch = content.match(/^go\s+(\S+)/m);
    if (goVerMatch) {
      result.projectVersion = goVerMatch[1];
    }

    const lines = content.split('\n');
    let inRequireBlock = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Start of require block
      if (line.startsWith('require') && line.includes('(')) {
        inRequireBlock = true;
        continue;
      }

      // End of require block
      if (line === ')') {
        inRequireBlock = false;
        continue;
      }

      // Single-line require: require github.com/pkg/errors v0.9.1
      if (line.startsWith('require ') && !line.includes('(')) {
        const parts = line.replace('require ', '').trim().split(/\s+/);
        if (parts.length >= 2) {
          const mod = parts[0];
          const version = this.cleanGoVersion(parts[1]);
          apps.push(this.makeApplication(mod, version, 'runtime', 'go'));
        }
        continue;
      }

      // Inside require block
      if (inRequireBlock) {
        if (!line || line.startsWith('//')) continue;

        // Strip // indirect comment
        const stripped = line.replace(/\/\/\s*indirect\s*$/, '').trim();
        if (!stripped) continue;

        const parts = stripped.split(/\s+/);
        if (parts.length >= 2) {
          const mod = parts[0];
          const version = this.cleanGoVersion(parts[1]);
          apps.push(this.makeApplication(mod, version, 'runtime', 'go'));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── go.sum ────────────────────────────────────────────────────

  private parseGoSum(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'go-modules', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      // Format: module version h1:hash
      // or:     module version/go.mod h1:hash
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;

      const mod = parts[0];
      let version = parts[1];

      // Strip /go.mod suffix from version
      if (version.endsWith('/go.mod')) {
        version = version.replace('/go.mod', '');
      }

      version = this.cleanGoVersion(version);

      const key = this.generateKey(mod, version);
      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(mod, version, 'runtime', 'go'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Clean Go module version string.
   * Removes 'v' prefix and any +incompatible suffix.
   */
  private cleanGoVersion(version: string): string {
    let v = version.trim();
    // Remove v prefix
    if (v.startsWith('v')) {
      v = v.slice(1);
    }
    // Remove +incompatible suffix
    if (v.includes('+incompatible')) {
      v = v.replace('+incompatible', '');
    }
    return v;
  }
}
