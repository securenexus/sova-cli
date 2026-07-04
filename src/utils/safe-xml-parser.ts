/**
 * safe-xml-parser - Factory for creating XML parsers with safe defaults.
 *
 * SECURITY NOTE: fast-xml-parser v4+ does not fetch external entities by default,
 * but we explicitly set processEntities: false to prevent any entity expansion
 * (which could enable XXE or entity expansion attacks).
 */

import { XMLParser, type X2jOptions } from 'fast-xml-parser';

/**
 * Create an XMLParser with safe defaults.
 *
 * Safe defaults applied:
 *  - ignoreAttributes: false  — parse attributes so callers can read them
 *  - processEntities: false   — disable entity processing to prevent XXE
 *
 * @param overrides - Additional fast-xml-parser options to merge in.
 *   Non-safety options (e.g. isArray, removeNSPrefix) are fine to override.
 *   Do NOT override processEntities: true without a security review.
 */
export function createSafeXmlParser(overrides: Partial<X2jOptions> = {}): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    ...overrides,
    // Enforced last so a caller override can never re-enable entity processing (XXE).
    processEntities: false,
  });
}
