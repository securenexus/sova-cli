/**
 * OcamlParser - Parse OCaml dependency files.
 *
 * Supported files:
 *  - dune-project ((depends ...) s-expression with package names and version constraints)
 *  - *.opam (opam package definition files)
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

type OpamScope = { scope: Application['scope']; rawScope?: string };

export class OcamlParser extends BaseParser {
  supportedLanguages = ['ocaml'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('.opam')) return this.parseOpamFile(filePath);
      if (lower.endsWith('dune-project')) return this.parseDuneProject(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'opam');
  }

  private parseOpamFile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'opam', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    // Project metadata
    const nameMatch = content.match(/^\s*name:\s*"([^"]+)"/m);
    if (nameMatch) result.projectName = nameMatch[1];

    const verMatch = content.match(/^\s*version:\s*"([^"]+)"/m);
    if (verMatch) result.projectVersion = verMatch[1];

    const licMatch = content.match(/^\s*license:\s*"([^"]+)"/m);
    if (licMatch) result.license = licMatch[1];

    const apps: Application[] = [];

    // Extract depends: [ ... ] block
    const dependsBlock = this.extractOpamListBlock(content, 'depends');
    if (dependsBlock) {
      apps.push(...this.parseOpamDependsEntries(dependsBlock));
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract the contents of an opam list-valued field, e.g. depends: [ ... ].
   */
  private extractOpamListBlock(content: string, field: string): string | null {
    const re = new RegExp(`^\\s*${field}\\s*:\\s*\\[`, 'm');
    const m = content.match(re);
    if (!m || m.index === undefined) return null;

    const startBracket = content.indexOf('[', m.index);
    if (startBracket === -1) return null;

    let depth = 0;
    for (let i = startBracket; i < content.length; i++) {
      const ch = content[i];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) return content.substring(startBracket + 1, i);
      }
    }
    return null;
  }

  /**
   * Parse opam depends entries. Each entry is typically:
   *   "pkg" {>= "1.0"}
   *   "pkg" {with-test}
   *   "pkg" {with-doc}
   *   "pkg" {>= "1.0" & with-test}
   */
  private parseOpamDependsEntries(block: string): Application[] {
    const apps: Application[] = [];
    // Matches a quoted package name followed by an optional {filter} block.
    const entryRe = /"([^"]+)"\s*(\{[^}]*\})?/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(block)) !== null) {
      const name = m[1];
      const filter = m[2] || '';
      // Extract version (first quoted string in the filter)
      let version = '';
      if (filter) {
        const vMatch = filter.match(/"([^"]+)"/);
        if (vMatch) version = vMatch[1];
      }
      const { scope, rawScope } = this.scopeFromFilter(filter);
      apps.push(this.makeApplication(name, version, scope, 'opam', rawScope));
    }
    return apps;
  }

  private scopeFromFilter(filter: string): OpamScope {
    if (!filter) return { scope: 'runtime' };
    if (/\bwith-test\b/.test(filter)) return { scope: 'dev', rawScope: 'with-test' };
    if (/\bwith-doc\b/.test(filter)) return { scope: 'dev', rawScope: 'with-doc' };
    return { scope: 'runtime' };
  }

  private parseDuneProject(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'opam', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Extract project name from (name ...)
    const nameMatch = content.match(/\(\s*name\s+(\S+)\s*\)/);
    if (nameMatch) {
      result.projectName = nameMatch[1];
    }

    // Extract version from (version ...)
    const verMatch = content.match(/\(\s*version\s+(\S+)\s*\)/);
    if (verMatch) {
      result.projectVersion = verMatch[1];
    }

    // Extract license from (license ...)
    const licenseMatch = content.match(/\(\s*license\s+(\S+)\s*\)/);
    if (licenseMatch) {
      result.license = licenseMatch[1];
    }

    // Extract (depends ...) block
    const dependsBlocks = this.extractDependsBlocks(content);

    for (const block of dependsBlocks) {
      apps.push(...this.parseDependsBlock(block));
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract the content of (depends ...) s-expressions.
   */
  private extractDependsBlocks(content: string): string[] {
    const blocks: string[] = [];
    let idx = 0;

    while (idx < content.length) {
      const dependsStart = content.indexOf('(depends', idx);
      if (dependsStart === -1) break;

      // Find matching closing paren
      const blockContent = this.extractSExprContent(content, dependsStart);
      if (blockContent) {
        blocks.push(blockContent);
        idx = dependsStart + blockContent.length + 10; // skip past
      } else {
        idx = dependsStart + 8;
      }
    }

    return blocks;
  }

  /**
   * Extract the content inside a parenthesized s-expression starting at idx.
   * Returns the content between the outer parens (excluding the keyword).
   */
  private extractSExprContent(content: string, start: number): string | null {
    let depth = 0;
    let blockStart = -1;

    for (let i = start; i < content.length; i++) {
      if (content[i] === '(') {
        depth++;
        if (depth === 1) {
          // Skip the keyword "depends"
          const afterKeyword = content.indexOf(' ', i + 1);
          if (afterKeyword !== -1) {
            blockStart = afterKeyword + 1;
          }
        }
      } else if (content[i] === ')') {
        depth--;
        if (depth === 0 && blockStart !== -1) {
          return content.substring(blockStart, i).trim();
        }
      }
    }

    return null;
  }

  /**
   * Parse the contents of a (depends ...) block.
   * Each dependency can be:
   *   - Simple name: package-name
   *   - With constraint: (package-name (>= "1.0"))
   *   - With complex constraint: (package-name (and (>= "1.0") (< "2.0")))
   */
  private parseDependsBlock(block: string): Application[] {
    const apps: Application[] = [];
    let idx = 0;

    while (idx < block.length) {
      // Skip whitespace
      while (idx < block.length && /\s/.test(block[idx])) idx++;
      if (idx >= block.length) break;

      if (block[idx] === '(') {
        // Parenthesized dependency: (name constraints...)
        const closeParen = this.findMatchingParen(block, idx);
        if (closeParen === -1) break;

        const inner = block.substring(idx + 1, closeParen).trim();
        const dep = this.parseSingleDep(inner);
        if (dep) {
          apps.push(this.makeApplication(dep.name, dep.version, 'runtime', 'opam'));
        }

        idx = closeParen + 1;
      } else {
        // Simple name (no parens)
        let end = idx;
        while (end < block.length && !/[\s()]/.test(block[end])) end++;
        const name = block.substring(idx, end).trim();

        if (name && !this.isKeyword(name)) {
          apps.push(this.makeApplication(name, '', 'runtime', 'opam'));
        }

        idx = end;
      }
    }

    return apps;
  }

  /**
   * Parse a single dependency from s-expression content.
   * e.g., "ocaml (>= 4.08)" or "dune (>= 3.0)"
   */
  private parseSingleDep(inner: string): { name: string; version: string } | null {
    // First token is the name
    const nameMatch = inner.match(/^(\S+)/);
    if (!nameMatch) return null;

    const name = nameMatch[1];
    if (this.isKeyword(name)) return null;

    const rest = inner.substring(nameMatch[0].length).trim();

    let version = '';
    if (rest) {
      // Extract version from constraint like (>= "1.0") or (>= 1.0)
      const verMatch = rest.match(/"?([\d]+(?:\.[\d]+)*)"?/);
      if (verMatch) {
        version = verMatch[1];
      }
    }

    return { name, version };
  }

  /**
   * Find the index of the matching closing parenthesis.
   */
  private findMatchingParen(str: string, openIdx: number): number {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /**
   * Check if a token is an s-expression keyword rather than a package name.
   */
  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'and', 'or', 'not', 'with-test', 'with-doc', 'with-dev-setup',
      'build', 'dev', 'doc', 'test', 'pin',
    ]);
    return keywords.has(name);
  }
}
