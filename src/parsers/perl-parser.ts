/**
 * PerlParser - Parse Perl dependency files.
 *
 * Supported files:
 *  - cpanfile (requires 'Module::Name', 'version' declarations)
 *
 * Scope mapping (cpanfile):
 *  - requires (top-level or `on 'runtime'`)        → runtime
 *  - test_requires or `on 'test'`                  → dev (rawScope `test_requires`)
 *  - develop_requires or `on 'develop'`            → dev (rawScope `develop_requires`)
 *  - configure_requires or `on 'configure'`        → build
 *  - recommends / suggests                         → optional
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

type Scope = Application['scope'];

interface ScopeInfo {
  scope: Scope;
  rawScope?: string;
}

/** Match `directive 'Name'` optionally followed by `, 'version-constraint'`. */
const DIRECTIVE_RE =
  /^\s*(requires|test_requires|develop_requires|configure_requires|recommends|suggests)\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?/;

/** Match the start of an `on '<phase>' => sub {` block. */
const ON_BLOCK_RE = /^\s*on\s+['"]([^'"]+)['"]\s*=>\s*sub\s*\{/;

export class PerlParser extends BaseParser {
  supportedLanguages = ['perl'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('cpanfile')) return this.parseCpanfile(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'cpan');
  }

  private parseCpanfile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cpan', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Track nesting of `on '<phase>' => sub { ... }` blocks via brace depth.
    type BlockFrame = { phase: string; depth: number };
    const blockStack: BlockFrame[] = [];
    let braceDepth = 0;

    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      // Strip line-level comments (basic — does not parse strings exhaustively).
      const line = rawLine.replace(/#.*$/, '');

      // Detect the start of an `on '<phase>' => sub {` block before counting braces,
      // so the opening brace on the same line is attributed to the new frame.
      const onMatch = line.match(ON_BLOCK_RE);
      if (onMatch) {
        // The opening `{` on this line will be counted below; remember the frame
        // depth as the depth *before* counting this line's braces.
        blockStack.push({ phase: onMatch[1], depth: braceDepth });
      }

      // Match a dependency directive on this line.
      const m = line.match(DIRECTIVE_RE);
      if (m) {
        const directive = m[1];
        const name = m[2];
        const versionConstraint = m[3] || '';
        const version = this.extractPerlVersion(versionConstraint);

        const currentPhase =
          blockStack.length > 0 ? blockStack[blockStack.length - 1].phase : null;
        const { scope, rawScope } = this.resolveScope(directive, currentPhase);

        const key = `${name.toLowerCase()}|${scope}`;
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(name, version, scope, 'cpan', rawScope));
        }
      }

      // Update brace depth based on this line's braces, then pop any frames
      // whose blocks have just closed.
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
          while (
            blockStack.length > 0 &&
            braceDepth <= blockStack[blockStack.length - 1].depth
          ) {
            blockStack.pop();
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Resolve normalized scope + rawScope from a directive name and the current
   * `on '<phase>'` block (if any).
   */
  private resolveScope(directive: string, phase: string | null): ScopeInfo {
    // `on '<phase>'` blocks override the directive's default scope.
    if (phase) {
      switch (phase) {
        case 'runtime':
          return { scope: 'runtime' };
        case 'test':
          return { scope: 'dev', rawScope: 'test_requires' };
        case 'develop':
          return { scope: 'dev', rawScope: 'develop_requires' };
        case 'configure':
          return { scope: 'build', rawScope: 'configure_requires' };
        case 'build':
          return { scope: 'build' };
      }
      // Unknown phase — fall through to directive-based resolution.
    }

    switch (directive) {
      case 'requires':
        return { scope: 'runtime' };
      case 'test_requires':
        return { scope: 'dev', rawScope: 'test_requires' };
      case 'develop_requires':
        return { scope: 'dev', rawScope: 'develop_requires' };
      case 'configure_requires':
        return { scope: 'build', rawScope: 'configure_requires' };
      case 'recommends':
        return { scope: 'optional', rawScope: 'recommends' };
      case 'suggests':
        return { scope: 'optional', rawScope: 'suggests' };
      default:
        return { scope: 'runtime' };
    }
  }

  /**
   * Extract version from Perl version constraint.
   * e.g., ">= 1.00, < 2.00" -> "1.00", "1.00" -> "1.00"
   */
  private extractPerlVersion(constraint: string): string {
    if (!constraint) return '';
    const cleaned = constraint.replace(/[><=!~]+\s*/g, '').trim();
    const match = cleaned.match(/([\d]+(?:\.[\d_]+)*)/);
    return match ? match[1] : '';
  }
}
