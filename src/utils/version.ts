/**
 * Version normalization utilities.
 * Standalone functions for use outside parser context.
 */

/** SOVA version — single source of truth. Update here only. */
export const SOVA_VERSION = '1.1.0';

const GIT_HASH_RE = /^[0-9a-f]{7,40}$/i;

/**
 * Clean and normalize a version string.
 */
export function normalizeVersion(version: string): string {
  if (!version) return '';
  let v = String(version).trim();
  for (const char of ['^', '~', '>', '<', '=', ' ']) {
    v = v.split(char).join('');
  }
  v = v.replace(/x/gi, '0');
  if (v.endsWith('*')) v = v.replace(/\*+$/, '') + '0';
  if (!v.includes('.') && GIT_HASH_RE.test(v)) return '';
  return v;
}

/**
 * Normalize package name (strip node_modules prefix, preserve @ scopes).
 */
export function normalizePackage(pkg: string): string {
  if (!pkg) return '';
  let p = String(pkg).trim();
  if (p.includes('node_modules/')) p = p.split('node_modules/').pop() || p;
  return p;
}

/**
 * Generate "package_:_version" key.
 */
export function generateKey(pkg: string, version: string): string {
  return `${normalizePackage(pkg)}_:_${normalizeVersion(version)}`;
}
