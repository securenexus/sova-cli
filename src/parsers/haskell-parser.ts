/**
 * HaskellParser - Parse Haskell dependency files.
 *
 * Supported files:
 *  - *.cabal (build-depends sections)
 *  - stack.yaml (extra-deps list)
 *  - package.yaml (dependencies list)
 */

import { parse as parseYaml } from 'yaml';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

type CabalBlockKind = 'library' | 'executable' | 'test-suite' | 'benchmark' | 'other';

interface CabalBlockContext {
  kind: CabalBlockKind;
  scope: Application['scope'];
  rawScope?: string;
}

const PKG_MANAGER = 'hackage';

export class HaskellParser extends BaseParser {
  supportedLanguages = ['haskell'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('.cabal')) return this.parseCabalFile(filePath);
      if (lower.endsWith('stack.yaml')) return this.parseStackYaml(filePath);
      if (lower.endsWith('package.yaml')) return this.parsePackageYaml(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'cabal');
  }

  // ── *.cabal ──────────────────────────────────────────────────

  private parseCabalFile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cabal', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Extract project metadata
    const nameMatch = content.match(/^name\s*:\s*(.+)/mi);
    if (nameMatch) result.projectName = nameMatch[1].trim();

    const verMatch = content.match(/^version\s*:\s*(.+)/mi);
    if (verMatch) result.projectVersion = verMatch[1].trim();

    const licenseMatch = content.match(/^license\s*:\s*(.+)/mi);
    if (licenseMatch) result.license = licenseMatch[1].trim();

    // Extract build-depends sections WITH the enclosing block context
    const buildDepsBlocks = this.extractBuildDependsBlocks(content);

    for (const { block, context } of buildDepsBlocks) {
      const entries = block.split(',');

      for (const entry of entries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;

        const parsed = this.parseCabalDep(trimmed);
        if (parsed) {
          apps.push(
            this.makeApplication(
              parsed.name,
              parsed.version,
              context.scope,
              PKG_MANAGER,
              context.rawScope,
            ),
          );
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Determine the block context (kind/scope/rawScope) for a top-level cabal stanza header line.
   * Cabal stanza headers are unindented and look like:
   *   library
   *   executable myapp
   *   test-suite my-test
   *   benchmark my-bench
   * Returns null if the line isn't a recognized stanza header.
   */
  private parseStanzaHeader(line: string): CabalBlockContext | null {
    // Header lines start at column 0 (no leading whitespace).
    if (line.length === 0 || line[0] === ' ' || line[0] === '\t') return null;

    const trimmed = line.trim();
    if (!trimmed) return null;

    // Strip trailing comment
    const commentIdx = trimmed.indexOf('--');
    const head = (commentIdx === -1 ? trimmed : trimmed.substring(0, commentIdx)).trim();
    if (!head) return null;

    const lower = head.toLowerCase();

    if (lower === 'library' || lower.startsWith('library ')) {
      return { kind: 'library', scope: 'runtime' };
    }
    if (lower.startsWith('executable ') || lower === 'executable') {
      return { kind: 'executable', scope: 'runtime' };
    }
    if (lower.startsWith('test-suite ') || lower === 'test-suite') {
      return { kind: 'test-suite', scope: 'dev', rawScope: 'test-suite' };
    }
    if (lower.startsWith('benchmark ') || lower === 'benchmark') {
      return { kind: 'benchmark', scope: 'dev', rawScope: 'benchmark' };
    }
    return null;
  }

  /**
   * Extract all build-depends blocks from a cabal file along with the
   * stanza context they belong to (library/executable/test-suite/benchmark).
   * Handles indentation-based continuation lines.
   */
  private extractBuildDependsBlocks(
    content: string,
  ): Array<{ block: string; context: CabalBlockContext }> {
    const blocks: Array<{ block: string; context: CabalBlockContext }> = [];
    const lines = content.split('\n');

    // Default context for top-level build-depends (rare): treat as runtime.
    let currentContext: CabalBlockContext = { kind: 'other', scope: 'runtime' };
    let currentBlock: string | null = null;

    const flush = () => {
      if (currentBlock !== null) {
        blocks.push({ block: currentBlock, context: currentContext });
        currentBlock = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect new top-level stanza headers (column 0, no leading whitespace)
      const stanza = this.parseStanzaHeader(line);
      if (stanza) {
        flush();
        currentContext = stanza;
        continue;
      }

      const trimmed = line.trimStart();

      if (trimmed.toLowerCase().startsWith('build-depends')) {
        flush();
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          currentBlock = trimmed.substring(colonIdx + 1).trim();
        } else {
          currentBlock = '';
        }
        continue;
      }

      if (currentBlock !== null) {
        // Continuation lines are indented (start with spaces/tabs)
        if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
          // Check if this is a continuation (not a new field)
          if (!trimmed.includes(':') || trimmed.startsWith(',')) {
            currentBlock += ' ' + trimmed;
            continue;
          }
          // Could be a continuation with a comma-separated dep that contains ':'
          // but more likely a new field. Check if it looks like a dep.
          if (/^\s*,/.test(line) || (/^[\s,]*[\w-]/.test(trimmed) && !trimmed.match(/^\w[\w-]*\s*:/))) {
            currentBlock += ' ' + trimmed;
            continue;
          }
        }
        // End of block
        flush();
      }
    }

    // Flush last block
    flush();

    return blocks;
  }

  /**
   * Parse a single cabal dependency entry.
   * e.g., "base >=4.7 && <5" -> { name: "base", version: "4.7" }
   */
  private parseCabalDep(entry: string): { name: string; version: string } | null {
    const trimmed = entry.trim();
    if (!trimmed) return null;

    // Split on first space or version operator
    const match = trimmed.match(/^([\w][\w.-]*)\s*(.*)?$/);
    if (!match) return null;

    const name = match[1];
    const constraint = (match[2] || '').trim();

    let version = '';
    if (constraint) {
      const verMatch = constraint.match(/([\d]+(?:\.[\d]+)*(?:\.\*)?)/);
      if (verMatch) {
        version = verMatch[1].replace(/\.\*$/, '');
      }
    }

    return { name, version };
  }

  // ── stack.yaml ───────────────────────────────────────────────

  private parseStackYaml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cabal', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch {
      return result;
    }
    if (!data) return result;

    const apps: Application[] = [];

    // extra-deps list: ["package-1.0.0", "package-2.0.0@sha256:..."]
    const extraDeps = data['extra-deps'] as unknown[] | undefined;
    if (Array.isArray(extraDeps)) {
      for (const entry of extraDeps) {
        if (typeof entry === 'string') {
          const parsed = this.parseStackDep(entry);
          if (parsed) {
            apps.push(this.makeApplication(parsed.name, parsed.version, 'runtime', PKG_MANAGER));
          }
        } else if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>;
          if (e['git']) {
            const url = String(e['git'] || '');
            const parts = url.replace(/\.git$/, '').split('/');
            const name = parts[parts.length - 1] || '';
            if (name) {
              apps.push(this.makeApplication(name, '', 'runtime', PKG_MANAGER));
            }
          }
        }
      }
    }

    // resolver can indicate which snapshot is used
    const resolver = data['resolver'] as string | undefined;
    if (resolver) {
      result.projectVersion = String(resolver);
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Parse a stack extra-dep entry.
   * Format: "package-name-1.0.0" or "package-name-1.0.0@sha256:..."
   */
  private parseStackDep(entry: string): { name: string; version: string } | null {
    // Strip @sha256:... suffix
    const cleaned = entry.split('@')[0].trim();

    // The version is the last hyphen-separated segment that starts with a digit
    const match = cleaned.match(/^(.+?)-([\d]+(?:\.[\d]+)*.*)$/);
    if (match) {
      return { name: match[1], version: match[2] };
    }

    return { name: cleaned, version: '' };
  }

  // ── package.yaml (hpack) ─────────────────────────────────────

  private parsePackageYaml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cabal', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch {
      return result;
    }
    if (!data) return result;

    result.projectName = String(data['name'] || '');
    result.projectVersion = String(data['version'] || '');
    result.license = String(data['license'] || '');

    const apps: Application[] = [];

    // Top-level dependencies → runtime
    const topDeps = data['dependencies'] as unknown[] | undefined;
    if (Array.isArray(topDeps)) {
      apps.push(...this.extractHpackDeps(topDeps, 'runtime'));
    }

    // Library dependencies → runtime
    const library = data['library'] as Record<string, unknown> | undefined;
    if (library?.['dependencies']) {
      apps.push(...this.extractHpackDeps(library['dependencies'] as unknown[], 'runtime'));
    }

    // Executable dependencies → runtime
    const executables = data['executables'] as Record<string, Record<string, unknown>> | undefined;
    if (executables && typeof executables === 'object') {
      for (const exe of Object.values(executables)) {
        if (exe?.['dependencies']) {
          apps.push(...this.extractHpackDeps(exe['dependencies'] as unknown[], 'runtime'));
        }
      }
    }

    // Test dependencies → dev (rawScope: 'test-suite')
    const tests = data['tests'] as Record<string, Record<string, unknown>> | undefined;
    if (tests && typeof tests === 'object') {
      for (const test of Object.values(tests)) {
        if (test?.['dependencies']) {
          apps.push(
            ...this.extractHpackDeps(test['dependencies'] as unknown[], 'dev', 'test-suite'),
          );
        }
      }
    }

    // Benchmark dependencies → dev (rawScope: 'benchmark')
    const benchmarks = data['benchmarks'] as Record<string, Record<string, unknown>> | undefined;
    if (benchmarks && typeof benchmarks === 'object') {
      for (const bench of Object.values(benchmarks)) {
        if (bench?.['dependencies']) {
          apps.push(
            ...this.extractHpackDeps(bench['dependencies'] as unknown[], 'dev', 'benchmark'),
          );
        }
      }
    }

    // Deduplicate by key
    const seen = new Set<string>();
    const deduped: Application[] = [];
    for (const app of apps) {
      if (!seen.has(app.key)) {
        seen.add(app.key);
        deduped.push(app);
      }
    }

    result.dependencies = deduped;
    return result;
  }

  /**
   * Extract dependencies from hpack (package.yaml) dependency list.
   * Entries can be strings: "base >=4.7 && <5" or objects with condition.
   */
  private extractHpackDeps(
    entries: unknown[],
    scope: Application['scope'],
    rawScope?: string,
  ): Application[] {
    const apps: Application[] = [];

    for (const entry of entries) {
      if (typeof entry === 'string') {
        const parsed = this.parseCabalDep(entry);
        if (parsed) {
          apps.push(this.makeApplication(parsed.name, parsed.version, scope, PKG_MANAGER, rawScope));
        }
      } else if (entry && typeof entry === 'object') {
        for (const [name, spec] of Object.entries(entry as Record<string, unknown>)) {
          if (name === 'condition' || name === 'when') continue;
          let version = '';
          if (typeof spec === 'string') {
            const verMatch = spec.match(/([\d]+(?:\.[\d]+)*)/);
            version = verMatch ? verMatch[1] : '';
          } else if (spec && typeof spec === 'object') {
            const s = spec as Record<string, unknown>;
            if (s['version']) {
              const verMatch = String(s['version']).match(/([\d]+(?:\.[\d]+)*)/);
              version = verMatch ? verMatch[1] : '';
            }
          }
          apps.push(this.makeApplication(name, version, scope, PKG_MANAGER, rawScope));
        }
      }
    }

    return apps;
  }
}
