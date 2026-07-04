/**
 * HtmlParser - Parse HTML files for CDN-loaded library references.
 *
 * Detects:
 *  - <script src="..."> tags pointing to CDN URLs
 *  - Extracts library name and version from URL patterns
 *
 * Common CDN patterns:
 *  - cdnjs.cloudflare.com/ajax/libs/{lib}/{version}/{file}
 *  - cdn.jsdelivr.net/npm/{lib}@{version}/{file}
 *  - unpkg.com/{lib}@{version}/{file}
 *  - code.jquery.com/jquery-{version}.min.js
 *  - Generic: lib-version.min.js or lib.version.js
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/** Regex to extract src from script tags */
const SCRIPT_SRC_RE = /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** Regex to extract href from link tags (CSS CDN) */
const LINK_HREF_RE = /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** CDN URL patterns with named groups */
const CDN_PATTERNS: Array<{ re: RegExp; nameGroup: number; versionGroup: number }> = [
  // cdnjs: /ajax/libs/jquery/3.6.0/jquery.min.js
  { re: /cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([\d.]+)/i, nameGroup: 1, versionGroup: 2 },
  // jsdelivr npm: /npm/lodash@4.17.21/
  { re: /cdn\.jsdelivr\.net\/npm\/(@?[^@/]+)@([\d][^/]*)/i, nameGroup: 1, versionGroup: 2 },
  // jsdelivr gh: /gh/owner/repo@version/
  { re: /cdn\.jsdelivr\.net\/gh\/([^@/]+\/[^@/]+)@([\d][^/]*)/i, nameGroup: 1, versionGroup: 2 },
  // unpkg: /react@18.2.0/
  { re: /unpkg\.com\/(@?[^@/]+)@([\d][^/]*)/i, nameGroup: 1, versionGroup: 2 },
  // Google APIs: /ajax/libs/jquery/3.6.0/
  { re: /ajax\.googleapis\.com\/ajax\/libs\/([^/]+)\/([\d.]+)/i, nameGroup: 1, versionGroup: 2 },
  // code.jquery.com: /jquery-3.6.0.min.js
  { re: /code\.jquery\.com\/([a-zA-Z]+)-([\d.]+)/i, nameGroup: 1, versionGroup: 2 },
  // Stackpath / Bootstrap CDN
  { re: /stackpath\.bootstrapcdn\.com\/([^/]+)\/([\d.]+)/i, nameGroup: 1, versionGroup: 2 },
  // Generic bootstrap CDN
  { re: /cdn\.jsdelivr\.net\/npm\/bootstrap@([\d][^/]*)/i, nameGroup: 0, versionGroup: 1 },
];

/** Generic filename pattern: lib-1.2.3.min.js or lib.1.2.3.js */
const GENERIC_VERSION_RE = /([a-zA-Z][\w.-]*?)[-.](\d+\.\d+(?:\.\d+)?(?:[-.\w]*)?)(?:\.min)?\.(?:js|css)$/;

export class HtmlParser extends BaseParser {
  supportedLanguages = ['html'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    try {
      return this.parseHtml(filePath);
    } catch {
      return this.createEmptyResult(filePath, 'cdn');
    }
  }

  private parseHtml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cdn', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Collect all URLs from script src and link href
    const urls: string[] = [];

    let match: RegExpExecArray | null;

    SCRIPT_SRC_RE.lastIndex = 0;
    while ((match = SCRIPT_SRC_RE.exec(content)) !== null) {
      urls.push(match[1]);
    }

    LINK_HREF_RE.lastIndex = 0;
    while ((match = LINK_HREF_RE.exec(content)) !== null) {
      const href = match[1];
      // Only consider CSS CDN links
      if (href.includes('cdn') || href.includes('unpkg') || href.includes('jsdelivr') || href.includes('cloudflare')) {
        urls.push(href);
      }
    }

    // Extract library info from each URL
    for (const url of urls) {
      const parsed = this.extractFromUrl(url);
      if (parsed) {
        const key = this.generateKey(parsed.name, parsed.version);
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(parsed.name, parsed.version, 'runtime', 'html'));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Try to extract library name and version from a CDN URL.
   */
  private extractFromUrl(url: string): { name: string; version: string } | null {
    // Try CDN-specific patterns first
    for (const pattern of CDN_PATTERNS) {
      const match = pattern.re.exec(url);
      if (match) {
        // Special case for bootstrap pattern without a name group
        if (pattern.nameGroup === 0 && pattern.versionGroup === 1) {
          return { name: 'bootstrap', version: match[1] };
        }
        const name = match[pattern.nameGroup];
        const version = match[pattern.versionGroup];
        if (name && version) {
          return { name: name.replace(/\.js$|\.css$/i, ''), version };
        }
      }
    }

    // Try generic filename pattern
    const filename = url.split('/').pop() || '';
    const genericMatch = GENERIC_VERSION_RE.exec(filename);
    if (genericMatch) {
      return { name: genericMatch[1], version: genericMatch[2] };
    }

    return null;
  }
}
