/**
 * RubyParser - Parse Ruby/Bundler dependency files.
 *
 * Supported files:
 *  - Gemfile (gem declarations, with :group annotations)
 *  - Gemfile.lock / gemfile.lock (SPECS section with indentation-based tree)
 *  - *.gemspec (add_runtime_dependency / add_development_dependency)
 *
 * Strict v2: emits Application[] with scope tags + PURLs.
 */

import { basename } from 'node:path';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';
import { SCOPE_MAPS, type SectionMapping } from './scope-mapping.js';

/** Regex for gem 'name', 'version' or gem "name", "~> 1.0" */
const GEM_RE = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?(?:,\s*['"]([^'"]*)['"]\s*)?/;

/** Regex for `group :dev[, :test] do` blocks */
const GROUP_RE = /^\s*group\s+(.+?)\s+do\s*$/;
/** Regex for `end` keyword closing a block */
const END_RE = /^\s*end\s*$/;

/** Regex for gemspec `s.add_runtime_dependency 'name', '>= 1.0'` */
const GEMSPEC_DEP_RE = /\.\s*(add_runtime_dependency|add_development_dependency|add_dependency)\s*\(?\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"])?/;

const PACKAGE_MANAGER = 'gem';

export class RubyParser extends BaseParser {
  supportedLanguages = ['ruby'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = basename(filePath).toLowerCase();

    try {
      if (lower === 'gemfile') return this.parseGemfile(filePath);
      if (lower === 'gemfile.lock') return this.parseGemfileLock(filePath);
      if (lower.endsWith('.gemspec')) return this.parseGemspec(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'bundler');
  }

  // ── Gemfile ───────────────────────────────────────────────────

  private parseGemfile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'bundler', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Track active group stack (each entry has the resolved scope + rawScope)
    const groupStack: Array<{ scope: Application['scope']; rawScope?: string }> = [];

    for (const rawLine of content.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Detect group block start: `group :development, :test do`
      const groupMatch = GROUP_RE.exec(line);
      if (groupMatch) {
        const groupNames = groupMatch[1]
          .split(',')
          .map(g => g.trim().replace(/^:/, '').replace(/['"]/g, ''))
          .filter(Boolean);
        const resolved = this.resolveGroupScope(groupNames);
        groupStack.push(resolved);
        continue;
      }

      // Detect block end
      if (END_RE.test(line) && groupStack.length > 0) {
        groupStack.pop();
        continue;
      }

      // Match a gem declaration
      const match = GEM_RE.exec(line);
      if (!match) continue;

      const name = match[1];
      const versionArg = match[2] || '';
      const version = this.extractGemVersion(versionArg);

      // Use innermost active group, else default to runtime
      const active = groupStack.length > 0 ? groupStack[groupStack.length - 1] : null;
      const scope: Application['scope'] = active ? active.scope : 'runtime';
      const rawScope = active ? active.rawScope : undefined;

      apps.push(this.makeApplication(name, version, scope, PACKAGE_MANAGER, rawScope));
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Map a list of bundler group names (e.g., ['development', 'test']) to a
   * normalized scope + rawScope using SCOPE_MAPS.rubygems. If multiple groups
   * are specified, prefer 'dev' if any is dev-like; preserve rawScope for the
   * matched mapping (e.g., 'test').
   */
  private resolveGroupScope(groupNames: string[]): { scope: Application['scope']; rawScope?: string } {
    if (groupNames.length === 0) return { scope: 'runtime' };

    let chosen: { scope: Application['scope']; rawScope?: string } | null = null;

    for (const name of groupNames) {
      const mapping = (SCOPE_MAPS.rubygems as readonly SectionMapping[]).find(m => m.section === name);
      if (mapping) {
        const candidate = { scope: mapping.scope, rawScope: mapping.rawScope };
        if (!chosen) {
          chosen = candidate;
        } else if (candidate.scope === 'dev' && chosen.scope !== 'dev') {
          chosen = candidate;
        }
      } else if (!chosen) {
        // Unknown group → treat as dev (custom user groups are non-runtime by convention)
        chosen = { scope: 'dev', rawScope: name };
      }
    }

    return chosen ?? { scope: 'runtime' };
  }

  /**
   * Extract version from a Gem version constraint.
   * e.g., "~> 1.4" → "1.4", ">= 2.0, < 3.0" → "2.0"
   */
  private extractGemVersion(constraint: string): string {
    if (!constraint) return '';

    // Strip operators
    const cleaned = constraint.replace(/[~><=!]+\s*/g, '').trim();

    // Take first version-like part
    const match = cleaned.match(/([\d]+(?:\.[\d]+)*)/);
    return match ? match[1] : '';
  }

  // ── Gemfile.lock ──────────────────────────────────────────────

  private parseGemfileLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'bundler', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const adjacency: Record<string, string[]> = {};

    const lines = content.split('\n');
    let inSpecs = false;
    let currentParent: string | null = null;
    let currentParentKey: string | null = null;
    const childBuffer: string[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trimEnd();

      // Detect GEM/SPECS section headers
      if (trimmed === '  GEM' || trimmed === '  PATH' || trimmed === '  GIT') {
        continue;
      }

      if (trimmed === '    specs:') {
        inSpecs = true;
        if (currentParentKey && childBuffer.length > 0) {
          adjacency[currentParentKey] = [...childBuffer];
        }
        currentParent = null;
        currentParentKey = null;
        childBuffer.length = 0;
        continue;
      }

      // End of specs section
      if (inSpecs && trimmed.length > 0 && !rawLine.startsWith('      ') && !rawLine.startsWith('    ')) {
        if (!rawLine.startsWith('    ')) {
          inSpecs = false;
          if (currentParentKey && childBuffer.length > 0) {
            adjacency[currentParentKey] = [...childBuffer];
          }
          currentParent = null;
          currentParentKey = null;
          childBuffer.length = 0;
          continue;
        }
      }

      if (!inSpecs) continue;

      // Determine indent level
      const indent = rawLine.length - rawLine.trimStart().length;
      const lineContent = rawLine.trimStart();
      if (!lineContent) continue;

      // 6-space indent = parent gem
      if (indent === 6) {
        if (currentParentKey && childBuffer.length > 0) {
          adjacency[currentParentKey] = [...childBuffer];
        }
        childBuffer.length = 0;

        const parsed = this.parseSpecLine(lineContent);
        if (parsed) {
          currentParent = parsed.name;
          // Lockfile has no group info — emit as runtime
          const app = this.makeApplication(parsed.name, parsed.version, 'runtime', PACKAGE_MANAGER);
          currentParentKey = app.key;
          apps.push(app);
        } else {
          currentParent = null;
          currentParentKey = null;
        }
        continue;
      }

      // 8-space indent = child dependency
      if (indent === 8 && currentParentKey) {
        const parsed = this.parseSpecLine(lineContent);
        if (parsed) {
          childBuffer.push(this.generateKey(parsed.name, parsed.version));
        }
        continue;
      }
    }

    // Flush last parent
    if (currentParentKey && childBuffer.length > 0) {
      adjacency[currentParentKey] = [...childBuffer];
    }

    // Resolve child versions: replace constraint versions with resolved versions
    const resolvedVersions: Record<string, string> = {};
    for (const app of apps) {
      resolvedVersions[app.name.toLowerCase()] = app.version;
    }

    const resolvedAdjacency: Record<string, string[]> = {};
    for (const [parentKey, children] of Object.entries(adjacency)) {
      const resolvedChildren: string[] = [];
      for (const child of children) {
        const parts = child.split('_:_');
        if (parts.length === 2) {
          const childName = parts[0];
          const resolved = resolvedVersions[childName.toLowerCase()];
          if (resolved) {
            resolvedChildren.push(this.generateKey(childName, resolved));
          } else {
            resolvedChildren.push(child);
          }
        } else {
          resolvedChildren.push(child);
        }
      }
      if (resolvedChildren.length > 0) {
        resolvedAdjacency[parentKey] = resolvedChildren;
      }
    }

    result.dependencies = apps;
    result.additionalDependencies = resolvedAdjacency;
    return result;
  }

  /**
   * Parse a spec line like "gemname (1.2.3)" into name and version.
   */
  private parseSpecLine(line: string): { name: string; version: string } | null {
    const match = line.match(/^(\S+)\s*\(([^)]*)\)/);
    if (!match) {
      const nameOnly = line.match(/^(\S+)/);
      if (nameOnly) return { name: nameOnly[1], version: '' };
      return null;
    }

    const name = match[1];
    const versionStr = match[2].trim();

    const verMatch = versionStr.match(/([\d]+(?:\.[\d]+)*(?:\.\w+)?)/);
    const version = verMatch ? verMatch[1] : versionStr;

    return { name, version };
  }

  // ── *.gemspec ─────────────────────────────────────────────────

  private parseGemspec(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'bundler', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const m = GEMSPEC_DEP_RE.exec(line);
      if (!m) continue;

      const method = m[1];
      const name = m[2];
      const versionArg = m[3] || '';
      const version = this.extractGemVersion(versionArg);

      let scope: Application['scope'];
      let rawScope: string | undefined;
      if (method === 'add_development_dependency') {
        scope = 'dev';
        rawScope = 'development';
      } else {
        // add_runtime_dependency / add_dependency
        scope = 'runtime';
      }

      apps.push(this.makeApplication(name, version, scope, PACKAGE_MANAGER, rawScope));
    }

    result.dependencies = apps;
    return result;
  }
}
