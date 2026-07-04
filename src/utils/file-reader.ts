/**
 * Encoding-safe file reading utilities.
 */

import { readFileSync, existsSync } from 'node:fs';

/**
 * Read file content with utf-8 → latin1 fallback.
 */
export function readFileSafe(filePath: string): string {
  if (!existsSync(filePath)) return '';

  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    // utf-8 decode failed — fall back to latin1 for binary-encoded files
    try {
      return readFileSync(filePath, 'latin1');
    } catch {
      // latin1 also failed (e.g. file deleted between existsSync and read) — return empty
      return '';
    }
  }
}

/**
 * Read file lines with utf-8 → latin1 fallback.
 */
export function readFileLinesSafe(filePath: string): string[] {
  const content = readFileSafe(filePath);
  return content ? content.split('\n') : [];
}

/**
 * Read and parse JSON file safely. Returns null on failure.
 */
export function readJsonSafe(filePath: string): unknown | null {
  const content = readFileSafe(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
