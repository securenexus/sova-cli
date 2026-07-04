/**
 * ElixirParser - Parse Elixir/Mix dependency files.
 *
 * Supported files:
 *  - mix.exs (deps function with {:dep_name, "~> version"} tuples)
 *  - mix.lock (Erlang-term map with "dep_name": {:hex, :dep_name, "version", ...})
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/**
 * mix.lock entry: "dep_name": {:hex, :dep_name, "1.0.0", ...}
 */
const LOCK_ENTRY_RE = /^\s*"(\w[\w-]*)"\s*:\s*\{:hex\s*,\s*:\w+\s*,\s*"([^"]+)"/gm;

interface MixDep {
  name: string;
  version: string;
  scope: Application['scope'];
  rawScope?: string;
}

export class ElixirParser extends BaseParser {
  supportedLanguages = ['elixir'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('mix.exs')) return this.parseMixExs(filePath);
      if (lower.endsWith('mix.lock')) return this.parseMixLock(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'hex');
  }

  // ── mix.exs ──────────────────────────────────────────────────

  private parseMixExs(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'hex', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    // Try to extract project name from: def project do [..., app: :my_app, ...]
    const appMatch = content.match(/app\s*:\s*:(\w+)/);
    if (appMatch) {
      result.projectName = appMatch[1];
    }

    // Try to extract project version
    const verMatch = content.match(/version\s*:\s*"([^"]+)"/);
    if (verMatch) {
      result.projectVersion = verMatch[1];
    }

    // Extract the deps block: look for defp deps do ... end
    const depsBlock = this.extractDepsBlock(content);
    const searchContent = depsBlock || content;

    const apps: Application[] = [];
    const seen = new Set<string>();

    for (const dep of this.parseDepTuples(searchContent)) {
      const lkey = dep.name.toLowerCase();
      if (seen.has(lkey)) continue;
      seen.add(lkey);
      apps.push(this.makeApplication(dep.name, dep.version, dep.scope, 'hex', dep.rawScope));
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Walk the deps block character by character and extract each top-level
   * `{:name, ...}` tuple, then parse name/version/only-option from it.
   */
  private parseDepTuples(content: string): MixDep[] {
    const out: MixDep[] = [];
    let i = 0;
    while (i < content.length) {
      // Look for `{:` to start a dep tuple
      if (content[i] === '{' && content[i + 1] === ':') {
        const end = this.findMatchingBrace(content, i);
        if (end === -1) break;
        const tuple = content.slice(i + 1, end); // strip outer braces
        const dep = this.parseSingleDep(tuple);
        if (dep) out.push(dep);
        i = end + 1;
        continue;
      }
      i++;
    }
    return out;
  }

  /**
   * Given a tuple body like `:phoenix, "~> 1.7", only: :test`, extract MixDep.
   * Returns null if no name found.
   */
  private parseSingleDep(body: string): MixDep | null {
    const nameMatch = body.match(/^\s*:(\w+)/);
    if (!nameMatch) return null;
    const name = nameMatch[1];

    // Version constraint: first quoted string after the name
    let version = '';
    const verMatch = body.match(/"([^"]+)"/);
    if (verMatch) {
      version = this.extractElixirVersion(verMatch[1]);
    }
    // If no version (git/github dep), leave empty.

    // only: :test  |  only: [:dev, :test]  |  only: :dev
    let scope: Application['scope'] = 'runtime';
    let rawScope: string | undefined;

    const onlyMatch = body.match(/\bonly\s*:\s*(\[[^\]]*\]|:\w+)/);
    if (onlyMatch) {
      const value = onlyMatch[1].trim();
      const envs: string[] = [];
      if (value.startsWith('[')) {
        // List form
        const inner = value.slice(1, -1);
        for (const m of inner.matchAll(/:(\w+)/g)) {
          envs.push(m[1]);
        }
      } else {
        // Single atom :env
        envs.push(value.replace(/^:/, ''));
      }

      // Determine scope from envs
      const hasProd = envs.includes('prod');
      const hasDev = envs.includes('dev');
      const hasTest = envs.includes('test');

      if (hasProd) {
        scope = 'runtime';
        rawScope = envs.join(',');
      } else if (envs.length === 1 && hasTest) {
        scope = 'dev';
        rawScope = 'test';
      } else if (envs.length === 1 && hasDev) {
        scope = 'dev';
        rawScope = 'dev';
      } else if (hasDev || hasTest) {
        // Mixed dev/test envs (e.g. [:dev, :test])
        scope = 'dev';
        rawScope = envs.join(',');
      } else {
        // Some other custom env — treat as dev to be safe
        scope = 'dev';
        rawScope = envs.join(',');
      }
    }

    return { name, version, scope, rawScope };
  }

  /**
   * Find index of the matching `}` for the `{` at `start`.
   * Respects nested braces and skips over double-quoted strings.
   */
  private findMatchingBrace(content: string, start: number): number {
    let depth = 0;
    let i = start;
    while (i < content.length) {
      const ch = content[i];
      if (ch === '"') {
        // Skip string
        i++;
        while (i < content.length && content[i] !== '"') {
          if (content[i] === '\\') i++;
          i++;
        }
        i++;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }

  /**
   * Extract the deps function body from mix.exs.
   */
  private extractDepsBlock(content: string): string | null {
    // Look for: defp deps do [...] end
    const depsMatch = content.match(/defp?\s+deps\b[^]*?\bdo\b([^]*?)\bend\b/);
    return depsMatch ? depsMatch[1] : null;
  }

  /**
   * Extract version from Elixir version constraint.
   * e.g., "~> 1.4" -> "1.4", ">= 1.0.0 and < 2.0.0" -> "1.0.0"
   */
  private extractElixirVersion(constraint: string): string {
    if (!constraint) return '';
    const cleaned = constraint.replace(/[~><=!]+\s*/g, '').trim();
    const match = cleaned.match(/([\d]+(?:\.[\d]+)*)/);
    return match ? match[1] : '';
  }

  // ── mix.lock ─────────────────────────────────────────────────

  private parseMixLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'hex', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    LOCK_ENTRY_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LOCK_ENTRY_RE.exec(content)) !== null) {
      const name = match[1];
      const version = match[2];
      const lkey = name.toLowerCase();
      if (seen.has(lkey)) continue;
      seen.add(lkey);
      apps.push(this.makeApplication(name, version, 'runtime', 'hex'));
    }

    result.dependencies = apps;
    return result;
  }
}
