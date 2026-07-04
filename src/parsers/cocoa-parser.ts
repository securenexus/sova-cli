/**
 * CocoaParser - Parse CocoaPods dependency files.
 *
 * Supported files:
 *  - Podfile (pod 'Name', '~> 1.0' declarations; :configurations => ['Debug'] → dev)
 *  - Podfile.lock (PODS section with "- PodName (version)" format and indentation-based tree)
 *  - *.podspec (s.dependency 'Name', '~> version' declarations)
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/**
 * Podspec dependency: s.dependency 'Name', '~> 1.0'
 * Also handles spec.dependency and ss.dependency
 */
const PODSPEC_DEP_RE = /\w+\.dependency\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?(?:,\s*['"]([^'"]*)['"]\s*)?/g;

/**
 * Podspec metadata: s.name = 'Name'
 */
const PODSPEC_NAME_RE = /\w+\.name\s*=\s*['"]([^'"]+)['"]/;
const PODSPEC_VERSION_RE = /\w+\.version\s*=\s*['"]([^'"]+)['"]/;
const PODSPEC_LICENSE_RE = /\w+\.license\s*=\s*(?:['"]([^'"]+)['"]|\{\s*(?::type\s*=>\s*['"]([^'"]+)['"]|type:\s*['"]([^'"]+)['"]))/;

/**
 * Podfile pod entry: pod 'Name'[, '~> 1.0'][, :configurations => ['Debug']]
 * Captures: name, version constraint (optional), trailing options text (optional)
 */
const PODFILE_POD_RE = /^\s*pod\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?(.*)$/;

export class CocoaParser extends BaseParser {
  supportedLanguages = ['cocoa'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('podfile.lock')) return this.parsePodfileLock(filePath);
      if (lower.endsWith('podfile')) return this.parsePodfile(filePath);
      if (lower.endsWith('.podspec')) return this.parsePodspec(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'cocoapods');
  }

  // ── Podfile ─────────────────────────────────────────────────

  private parsePodfile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cocoapods', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const lines = content.split('\n');

    for (const rawLine of lines) {
      // Strip trailing comments (# ...)
      const line = rawLine.replace(/#.*$/, '');
      const match = line.match(PODFILE_POD_RE);
      if (!match) continue;

      const name = match[1];
      const versionConstraint = match[2] || '';
      const tail = match[3] || '';

      const version = this.extractPodVersion(versionConstraint);

      // Detect :configurations => ['Debug'] (debug-only) → dev
      let scope: Application['scope'] = 'runtime';
      let rawScope: string | undefined;
      const configsMatch = tail.match(/:configurations\s*=>\s*\[([^\]]*)\]/);
      if (configsMatch) {
        const cfgs = configsMatch[1]
          .split(',')
          .map(s => s.replace(/['"\s]/g, ''))
          .filter(Boolean);
        if (cfgs.length > 0 && cfgs.every(c => /debug/i.test(c))) {
          scope = 'dev';
          rawScope = `${cfgs.join(',')}-config`;
        }
      }

      apps.push(this.makeApplication(name, version, scope, 'cocoapods', rawScope));
    }

    result.dependencies = apps;
    return result;
  }

  // ── Podfile.lock ─────────────────────────────────────────────

  private parsePodfileLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cocoapods', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const adjacency: Record<string, string[]> = {};
    const lines = content.split('\n');

    let inPods = false;
    let currentParent: string | null = null;
    let currentParentKey: string | null = null;
    const childBuffer: string[] = [];

    // Collect resolved versions for child resolution
    const resolvedVersions: Record<string, string> = {};

    // First pass: collect all pod versions from the PODS section
    let firstPassInPods = false;
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (trimmed === 'PODS:') {
        firstPassInPods = true;
        continue;
      }

      if (firstPassInPods && trimmed.length > 0 && !rawLine.startsWith(' ')) {
        firstPassInPods = false;
        continue;
      }

      if (!firstPassInPods) continue;

      // Match "- PodName (version)" at 2-space indent (top-level pod)
      const indent = rawLine.length - rawLine.trimStart().length;
      if (indent === 2 && trimmed.startsWith('- ')) {
        const parsed = this.parsePodEntry(trimmed.substring(2));
        if (parsed) {
          resolvedVersions[parsed.name.toLowerCase()] = parsed.version;
          // Handle subspecs: "Pod/Subspec (1.0)" -> also resolve "Pod"
          if (parsed.name.includes('/')) {
            const baseName = parsed.name.split('/')[0];
            if (!resolvedVersions[baseName.toLowerCase()]) {
              resolvedVersions[baseName.toLowerCase()] = parsed.version;
            }
          }
        }
      }
    }

    // Second pass: build dependency tree
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (trimmed === 'PODS:') {
        inPods = true;
        continue;
      }

      // End of PODS section (next section header or empty line followed by non-indented text)
      if (inPods && trimmed.length > 0 && !rawLine.startsWith(' ')) {
        // Flush last parent
        if (currentParentKey && childBuffer.length > 0) {
          adjacency[currentParentKey] = [...childBuffer];
        }
        inPods = false;
        continue;
      }

      if (!inPods) continue;
      if (!trimmed) continue;

      const indent = rawLine.length - rawLine.trimStart().length;

      // 2-space indent: top-level pod "- PodName (version)"
      if (indent === 2 && trimmed.startsWith('- ')) {
        // Flush previous parent
        if (currentParentKey && childBuffer.length > 0) {
          adjacency[currentParentKey] = [...childBuffer];
        }
        childBuffer.length = 0;

        const parsed = this.parsePodEntry(trimmed.substring(2));
        if (parsed) {
          currentParent = parsed.name;
          currentParentKey = this.generateKey(parsed.name, parsed.version);
          // Podfile.lock: all → runtime
          apps.push(this.makeApplication(parsed.name, parsed.version, 'runtime', 'cocoapods'));
        } else {
          currentParent = null;
          currentParentKey = null;
        }
        continue;
      }

      // 4-space indent: child dependency "- ChildPod (>= 1.0)"
      if (indent === 4 && trimmed.startsWith('- ') && currentParentKey) {
        const parsed = this.parsePodEntry(trimmed.substring(2));
        if (parsed) {
          // Try to resolve the child's version from the top-level pods
          const resolvedVer = resolvedVersions[parsed.name.toLowerCase()] || parsed.version;
          childBuffer.push(this.generateKey(parsed.name, resolvedVer));
        }
        continue;
      }
    }

    // Flush last parent
    if (currentParentKey && childBuffer.length > 0) {
      adjacency[currentParentKey] = [...childBuffer];
    }

    result.dependencies = apps;
    result.additionalDependencies = adjacency;
    return result;
  }

  /**
   * Parse a pod entry like "PodName (1.2.3)" or "PodName (>= 1.0, < 2.0)" or just "PodName".
   */
  private parsePodEntry(entry: string): { name: string; version: string } | null {
    const trimmed = entry.trim();
    if (!trimmed) return null;

    // Format: "PodName (version)" or "PodName"
    const match = trimmed.match(/^([^\s(]+(?:\/[^\s(]+)?)\s*(?:\(([^)]*)\))?/);
    if (!match) return null;

    const name = match[1];
    const versionStr = (match[2] || '').trim();

    let version = '';
    if (versionStr) {
      // Extract the first version number from potential constraints
      const verMatch = versionStr.match(/([\d]+(?:\.[\d]+)*(?:\.\w+)?)/);
      version = verMatch ? verMatch[1] : '';
    }

    return { name, version };
  }

  // ── *.podspec ────────────────────────────────────────────────

  private parsePodspec(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cocoapods', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    // Extract metadata
    const nameMatch = PODSPEC_NAME_RE.exec(content);
    if (nameMatch) result.projectName = nameMatch[1];

    const verMatch = PODSPEC_VERSION_RE.exec(content);
    if (verMatch) result.projectVersion = verMatch[1];

    const licenseMatch = PODSPEC_LICENSE_RE.exec(content);
    if (licenseMatch) result.license = licenseMatch[1] || licenseMatch[2] || licenseMatch[3] || '';

    const apps: Application[] = [];

    PODSPEC_DEP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PODSPEC_DEP_RE.exec(content)) !== null) {
      const name = match[1];
      const versionConstraint = match[2] || '';
      const version = this.extractPodVersion(versionConstraint);
      apps.push(this.makeApplication(name, version, 'runtime', 'cocoapods'));
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract version from CocoaPods version constraint.
   * e.g., "~> 1.0" -> "1.0", ">= 1.0, < 2.0" -> "1.0"
   */
  private extractPodVersion(constraint: string): string {
    if (!constraint) return '';
    const cleaned = constraint.replace(/[~><=!]+\s*/g, '').trim();
    const match = cleaned.match(/([\d]+(?:\.[\d]+)*)/);
    return match ? match[1] : '';
  }
}
