// src/scanner/pre-scan.ts
import { readdirSync, lstatSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { LANGUAGE_FILES, EXCLUDED_DIRS } from '../config/language-files.js';
import { formatSize } from '../utils/parse-size.js';

export interface PreScanResult {
  fileCount: number;
  totalSize: number;
  maxFileSizeFound: number;
  maxDepthReached: number;
  skippedFiles: Array<{ path: string; size: number; reason: string }>;
}

interface LimitConfig {
  maxDepth: number;
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
  maxOutputSize: number;
}

const ALL_PATTERNS: string[] = Object.values(LANGUAGE_FILES).flat();

function matchesAnyPattern(fileName: string, relPath: string): boolean {
  const lowerFile = fileName.toLowerCase();
  for (const pattern of ALL_PATTERNS) {
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.startsWith('*.')) {
      if (lowerFile.endsWith(lowerPattern.slice(1))) return true;
    } else if (lowerPattern.includes('/') && lowerPattern.includes('*')) {
      const parts = lowerPattern.split('*');
      if (parts.length === 2) {
        const normalizedRel = relPath.replace(/\\/g, '/').toLowerCase();
        if (normalizedRel.startsWith(parts[0]) && normalizedRel.endsWith(parts[1])) return true;
      }
    } else {
      if (lowerFile === lowerPattern) return true;
    }
  }
  return false;
}

export function preScan(rootDir: string, limits: LimitConfig): PreScanResult {
  let fileCount = 0;
  let totalSize = 0;
  let maxFileSizeFound = 0;
  let maxDepthReached = 0;
  const skippedFiles: PreScanResult['skippedFiles'] = [];

  function walk(dir: string, depth: number): void {
    if (depth > limits.maxDepth) return;
    if (depth > maxDepthReached) maxDepthReached = depth;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry) || entry.startsWith('.')) {
          if (entry !== '.github') continue;
        }
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        const fileName = basename(fullPath);
        const relPath = relative(rootDir, fullPath);
        if (!matchesAnyPattern(fileName, relPath)) continue;

        fileCount++;
        const fileSize = stat.size;
        if (fileSize > maxFileSizeFound) maxFileSizeFound = fileSize;

        if (fileSize > limits.maxFileSize) {
          skippedFiles.push({
            path: relPath,
            size: fileSize,
            reason: `File size ${formatSize(fileSize)} exceeds limit of ${formatSize(limits.maxFileSize)}`,
          });
        } else {
          totalSize += fileSize;
        }

        if (fileCount > limits.maxFiles) {
          throw new Error(
            `Scan aborted: ${fileCount} files found, exceeds limit of ${limits.maxFiles}. ` +
            `Path may be too broad. Adjust via --max-files or .sovarc.`,
          );
        }

        if (totalSize > limits.maxTotalSize) {
          throw new Error(
            `Scan aborted: total scan size ${formatSize(totalSize)} exceeds limit of ${formatSize(limits.maxTotalSize)}. ` +
            `Adjust via .sovarc or narrow the scan path.`,
          );
        }
      }
    }
  }

  walk(rootDir, 0);
  return { fileCount, totalSize, maxFileSizeFound, maxDepthReached, skippedFiles };
}
