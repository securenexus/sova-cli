/**
 * ErlangParser - Parse Erlang dependency files.
 *
 * Supported files:
 *  - rebar.lock (Erlang-term format [{<<"dep">>, ...}])
 *  - rebar.config ({deps, [...]} section with {dep_name, "version", {git, ...}} tuples)
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/**
 * rebar.lock entry: {<<"dep_name">>,{pkg,<<"dep_name">>,<<"1.0.0">>,...},...}
 * Capture the dep name and version from hex package entries.
 */
const LOCK_HEX_RE = /\{<<"([\w-]+)">>\s*,\s*\{pkg\s*,\s*<<"[\w-]+">>\s*,\s*<<"([^"]+)">>/g;

/**
 * rebar.lock git entry: {<<"dep_name">>,{git,"url",{ref,"hash"}},...}
 */
const LOCK_GIT_RE = /\{<<"([\w-]+)">>\s*,\s*\{git\s*,\s*"([^"]+)"/g;

/**
 * rebar.config dep: {dep_name, "version"}
 * or {dep_name, ".*", {git, "url", {tag, "version"}}}
 */
const CONFIG_DEP_VERSION_RE = /\{\s*(\w+)\s*,\s*"([^"]+)"\s*\}/g;

/**
 * rebar.config dep with git tag: {dep_name, ".*", {git, "url", {tag, "version"}}}
 */
const CONFIG_DEP_GIT_TAG_RE = /\{\s*(\w+)\s*,[^}]*\{(?:git|hg)\s*,\s*"[^"]*"\s*,\s*\{(?:tag|branch|ref)\s*,\s*"([^"]+)"\s*\}/g;

interface DepSection {
  block: string;
  scope: Application['scope'];
  rawScope: string;
}

export class ErlangParser extends BaseParser {
  supportedLanguages = ['erlang'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('rebar.lock')) return this.parseRebarLock(filePath);
      if (lower.endsWith('rebar.config')) return this.parseRebarConfig(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'hex');
  }

  // ── rebar.lock ───────────────────────────────────────────────

  private parseRebarLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'hex', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Match hex package entries
    LOCK_HEX_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LOCK_HEX_RE.exec(content)) !== null) {
      const name = match[1];
      const version = match[2];
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(name, version, 'runtime', 'rebar'));
      }
    }

    // Match git entries (no version, just name)
    LOCK_GIT_RE.lastIndex = 0;
    while ((match = LOCK_GIT_RE.exec(content)) !== null) {
      const name = match[1];
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(name, '', 'runtime', 'rebar'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── rebar.config ─────────────────────────────────────────────

  private parseRebarConfig(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'hex', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    const sections: DepSection[] = [];

    // Top-level {deps, [...]} → runtime
    const topDeps = this.extractDepsBlock(content);
    if (topDeps !== null) {
      sections.push({ block: topDeps, scope: 'runtime', rawScope: 'deps' });
    }

    // {profiles, [{test, [{deps, [...]}]}, {dev, [{deps, [...]}]}]} → dev
    for (const prof of this.extractProfileDepsBlocks(content)) {
      sections.push(prof);
    }

    // Fallback: if no top-level deps block matched but content has deps,
    // search the whole file for runtime entries.
    const sectionsToScan: DepSection[] =
      sections.length > 0
        ? sections
        : [{ block: content, scope: 'runtime', rawScope: 'deps' }];

    for (const section of sectionsToScan) {
      this.collectDepsFromBlock(section, apps, seen);
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Scan one dep block for {name, "version"} and git-tag deps, append to apps.
   */
  private collectDepsFromBlock(
    section: DepSection,
    apps: Application[],
    seen: Set<string>,
  ): void {
    const { block, scope, rawScope } = section;

    // Match simple version deps: {dep_name, "version"}
    const simpleRe = new RegExp(CONFIG_DEP_VERSION_RE.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = simpleRe.exec(block)) !== null) {
      const name = match[1];
      const version = match[2];
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const cleanVersion = this.extractErlangVersion(version);
        apps.push(this.makeApplication(name, cleanVersion, scope, 'rebar', rawScope));
      }
    }

    // Match git tag deps
    const gitRe = new RegExp(CONFIG_DEP_GIT_TAG_RE.source, 'g');
    while ((match = gitRe.exec(block)) !== null) {
      const name = match[1];
      let version = match[2];
      const key = name.toLowerCase();

      // Strip v prefix from tags
      if (version.startsWith('v')) {
        version = version.slice(1);
      }

      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(name, version, scope, 'rebar', rawScope));
      }
    }
  }

  /**
   * Extract the top-level {deps, [...]} block from rebar.config.
   * Excludes deps blocks nested inside profiles by only matching the first
   * top-level occurrence outside of profile sections.
   */
  private extractDepsBlock(content: string): string | null {
    // Strip profiles section first to avoid matching profile deps as top-level.
    const stripped = this.stripProfilesSection(content);
    const match = stripped.match(/\{\s*deps\s*,\s*\[([\s\S]*?)\]\s*\}/);
    return match ? match[1] : null;
  }

  /**
   * Remove the {profiles, [...]} block from content so top-level deps regex
   * doesn't accidentally pick up profile-scoped deps.
   */
  private stripProfilesSection(content: string): string {
    const idx = content.search(/\{\s*profiles\s*,/);
    if (idx === -1) return content;
    // Find matching closing bracket via bracket counting starting from idx.
    let depth = 0;
    let end = -1;
    for (let i = idx; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) return content;
    return content.slice(0, idx) + content.slice(end);
  }

  /**
   * Extract per-profile deps blocks. Returns one DepSection per profile that
   * declares a deps list.
   */
  private extractProfileDepsBlocks(content: string): DepSection[] {
    const sections: DepSection[] = [];
    const profilesIdx = content.search(/\{\s*profiles\s*,/);
    if (profilesIdx === -1) return sections;

    // Find end of profiles section
    let depth = 0;
    let profilesEnd = -1;
    for (let i = profilesIdx; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          profilesEnd = i + 1;
          break;
        }
      }
    }
    if (profilesEnd === -1) return sections;

    const profilesBlock = content.slice(profilesIdx, profilesEnd);

    // For each profile name, locate the deps list that follows.
    const profileRe = /\{\s*(\w+)\s*,\s*\[/g;
    let m: RegExpExecArray | null;
    while ((m = profileRe.exec(profilesBlock)) !== null) {
      const profileName = m[1];
      // Skip the literal "profiles" wrapper
      if (profileName === 'profiles' || profileName === 'deps') continue;

      // Find a deps block within this profile's body.
      // Search from current position forward; bound to the matching ']' for this profile.
      const tail = profilesBlock.slice(m.index);
      const depsMatch = tail.match(/\{\s*deps\s*,\s*\[([\s\S]*?)\]\s*\}/);
      if (depsMatch) {
        sections.push({
          block: depsMatch[1],
          scope: 'dev',
          rawScope: `profiles.${profileName}.deps`,
        });
      }
    }

    return sections;
  }

  /**
   * Extract version from an Erlang version string.
   * Skips regex patterns like ".*", returns numeric versions.
   */
  private extractErlangVersion(version: string): string {
    if (!version) return '';
    // Skip regex-like patterns
    if (version === '.*' || version === '*') return '';
    // Extract numeric version
    const match = version.match(/([\d]+(?:\.[\d]+)*)/);
    return match ? match[1] : '';
  }
}
