/**
 * FileDiscovery - Scans a project directory for dependency files.
 *
 * Walks the directory tree, matches files against LANGUAGE_FILES patterns,
 * and returns { language: [absolutePaths] }.
 */

import { readdirSync, lstatSync } from 'node:fs';
import { join, basename, relative, extname } from 'node:path';
import { LANGUAGE_FILES, EXCLUDED_DIRS } from '../config/language-files.js';

export interface DiscoveryResult {
  /** language → list of absolute file paths */
  files: Record<string, string[]>;
  /** Total files found */
  totalFiles: number;
  /** Languages detected */
  languagesDetected: string[];
}

/**
 * Check if a filename matches a pattern from languageFiles config.
 * Patterns can be:
 *  - Exact filename: "package.json"
 *  - Extension glob: "*.csproj"
 *  - Path glob: ".github/workflows/*.yml"
 */
function matchesPattern(fileName: string, relativePath: string, pattern: string): boolean {
  const lowerFile = fileName.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Extension glob: "*.ext"
  if (lowerPattern.startsWith('*.')) {
    const ext = lowerPattern.slice(1); // ".ext"
    return lowerFile.endsWith(ext);
  }

  // Path glob with wildcard: ".github/workflows/*.yml"
  if (lowerPattern.includes('/') && lowerPattern.includes('*')) {
    const parts = lowerPattern.split('*');
    if (parts.length === 2) {
      const normalizedRel = relativePath.replace(/\\/g, '/').toLowerCase();
      return normalizedRel.startsWith(parts[0]) && normalizedRel.endsWith(parts[1]);
    }
  }

  // Exact filename match (case-insensitive)
  return lowerFile === lowerPattern;
}

/**
 * Scan a directory tree for dependency files.
 *
 * @param rootDir - Root directory to scan
 * @param maxDepth - Maximum directory traversal depth
 * @param languageFilter - Optional list of languages to scan for (empty = all)
 * @param verbose - Log progress
 */
export function discoverFiles(
  rootDir: string,
  maxDepth = 10,
  languageFilter?: string[],
  verbose = false,
  skipPaths?: Set<string>,
): DiscoveryResult {
  const result: Record<string, string[]> = {};
  let totalFiles = 0;

  // Determine which languages to scan for
  const languagesToScan = languageFilter
    ? Object.entries(LANGUAGE_FILES).filter(([lang]) => languageFilter.includes(lang))
    : Object.entries(LANGUAGE_FILES);

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      // Permission denied or invalid dir — intentionally swallowed
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        // Broken symlink or permission issue — intentionally swallowed
        continue;
      }

      // Skip symlinks — following them could escape the scan root (symlink attack)
      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.has(entry) || entry.startsWith('.')) {
          // Exception: allow .github for github-actions
          if (entry !== '.github') continue;
        }
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        const fileName = basename(fullPath);
        const relPath = relative(rootDir, fullPath);

        // Skip files flagged by pre-scan (e.g., exceeds maxFileSize)
        if (skipPaths?.has(relPath)) {
          if (verbose) console.log(`  [skipped] ${relPath} (exceeds size limit)`);
          continue;
        }

        // Check against each language's file patterns
        for (const [language, patterns] of languagesToScan) {
          for (const pattern of patterns) {
            if (matchesPattern(fileName, relPath, pattern)) {
              if (!result[language]) result[language] = [];
              // Avoid duplicates (same file matched by multiple patterns)
              if (!result[language].includes(fullPath)) {
                result[language].push(fullPath);
                totalFiles++;
                if (verbose) {
                  console.log(`  [${language}] ${relPath}`);
                }
              }
              break; // Don't add same file twice for same language
            }
          }
        }
      }
    }
  }

  walk(rootDir, 0);

  const languagesDetected = Object.keys(result).filter(
    (lang) => result[lang].length > 0,
  );

  return { files: result, totalFiles, languagesDetected };
}
