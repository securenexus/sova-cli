/**
 * SwiftParser - Parse Swift Package Manager dependency files.
 *
 * Supported files:
 *  - Package.swift (.package(url:..., from:...) and .package(url:..., .upToNextMajor(from:...)))
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { ParsedResult, Application } from '../types/parser.js';

/**
 * .package(name: "Name", url: "https://...", from: "1.0.0")
 * .package(name: "Name", url: "https://...", .upToNextMajor(from: "1.0.0"))
 */
const PKG_FROM_RE = /\.package\s*\([^)]*url\s*:\s*"([^"]+)"[^)]*from\s*:\s*"([^"]+)"/g;

/**
 * .package(url: "https://...", .upToNextMajor(from: "1.0.0"))
 * .package(url: "https://...", .upToNextMinor(from: "1.0.0"))
 */
const PKG_UP_TO_RE = /\.package\s*\([^)]*url\s*:\s*"([^"]+)"[^)]*\.upToNext(?:Major|Minor)\s*\(\s*from\s*:\s*"([^"]+)"\s*\)/g;

/**
 * .package(url: "https://...", exact: "1.0.0")
 */
const PKG_EXACT_RE = /\.package\s*\([^)]*url\s*:\s*"([^"]+)"[^)]*exact\s*:\s*"([^"]+)"/g;

/**
 * .package(url: "https://...", "1.0.0"..<"2.0.0")
 * .package(url: "https://...", "1.0.0"..."2.0.0")
 */
const PKG_RANGE_RE = /\.package\s*\([^)]*url\s*:\s*"([^"]+)"[^)]*"([\d][^"]+)"\.\.+[<.]?"[\d][^"]*"/g;

export class SwiftParser extends BaseParser {
  supportedLanguages = ['swift'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('package.swift')) return this.parsePackageSwift(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'swift-pm');
  }

  private parsePackageSwift(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'swift-pm', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Extract project name from: let package = Package(name: "MyPackage", ...)
    const nameMatch = content.match(/Package\s*\(\s*name\s*:\s*"([^"]+)"/);
    if (nameMatch) {
      result.projectName = nameMatch[1];
    }

    // Apply all regex patterns
    const regexes = [PKG_FROM_RE, PKG_UP_TO_RE, PKG_EXACT_RE, PKG_RANGE_RE];

    for (const regex of regexes) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const url = match[1];
        const version = match[2];
        const pkgName = this.extractPackageName(url);

        if (pkgName && !seen.has(pkgName.toLowerCase())) {
          seen.add(pkgName.toLowerCase());
          apps.push(this.makeApplication(pkgName, version, 'runtime', 'swift'));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract package name from a git URL.
   * e.g., "https://github.com/apple/swift-nio.git" -> "swift-nio"
   */
  private extractPackageName(url: string): string {
    // Remove trailing .git
    let cleaned = url.replace(/\.git$/, '');
    // Take the last path segment
    const parts = cleaned.split('/');
    return parts[parts.length - 1] || '';
  }
}
