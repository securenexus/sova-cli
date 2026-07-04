/**
 * {Language}Parser - Parse {Language} dependency files (Manifest v2 reference template).
 *
 * To add a new parser:
 * 1. Copy this file to `src/parsers/{language}-parser.ts`
 * 2. Rename `TemplateParser` and update `supportedLanguages`
 * 3. Implement the `parse()` method using `makeApplication` (see v2 pattern below)
 * 4. Add fixtures to `tests/fixtures/{language}/`
 * 5. Write tests in `tests/parsers/{language}-parser.test.ts`
 * 6. The parser auto-registers via `supportedLanguages` in `parser-registry.ts`
 *
 * ── Manifest v2 pattern ─────────────────────────────────────────────
 *
 * In v2, parsers emit `Application[]` (rich dep records with name, version,
 * scope, rawScope, purl, and key) — NOT flat "name_:_version" strings.
 *
 * Always prefer `this.makeApplication(pkg, version, scope, packageManager, rawScope)`
 * over `this.generateKey(...)` — `makeApplication` handles normalization,
 * scope tagging, and PURL construction in one call. `generateKey` still exists
 * but is now an internal helper used by `makeApplication`.
 *
 * Iterate ecosystem sections through `SCOPE_MAPS` so scope tagging stays
 * consistent across parsers (e.g. `dependencies` → runtime, `devDependencies`
 * → dev, `peerDependencies` → peer).
 *
 * Runtime constraints (engines, language versions, SDK floors) belong in
 * `result.engines` as `RuntimeConstraint[]` — they are NOT dependencies.
 */
import { BaseParser } from '../base-parser.js';
import { readJsonSafe } from '../../utils/file-reader.js';
import { SCOPE_MAPS } from '../scope-mapping.js';
import type { Application, ParsedResult, RuntimeConstraint } from '../../types/parser.js';

export class TemplateParser extends BaseParser {
  supportedLanguages = ['template'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    // Use the package-manager slug for this ecosystem (e.g. 'npm', 'pypi',
    // 'cargo', 'maven'). It feeds the PURL builder and the manifest output.
    const packageManager = 'template-pm';
    const result = this.createEmptyResult(filePath, packageManager, 'manifest');

    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];

    // ── Iterate scope maps (npm-style example) ────────────────────
    // Each entry pairs a section name (e.g. 'devDependencies') with its
    // canonical scope ('dev') and an optional rawScope override that
    // preserves the ecosystem's native label.
    for (const mapping of SCOPE_MAPS.npm) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope;
      const sectionDeps = content[section];
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;

      for (const [pkg, version] of Object.entries(sectionDeps as Record<string, string>)) {
        // makeApplication handles name/version normalization, scope tagging,
        // PURL construction, and key generation in one call.
        apps.push(
          this.makeApplication(pkg, String(version || ''), scope, packageManager, rawScope ?? section),
        );
      }
    }

    // ── Engines / runtime constraints ─────────────────────────────
    // Language versions, SDK floors, and similar runtime requirements
    // are NOT dependencies — emit them on `result.engines` instead.
    const engines: RuntimeConstraint[] = [];
    if (content.engines && typeof content.engines === 'object') {
      for (const [name, constraint] of Object.entries(content.engines as Record<string, string>)) {
        engines.push({ name, constraint: String(constraint) });
      }
    }

    // ── Project metadata ──────────────────────────────────────────
    result.projectName = String(content['name'] || '');
    result.projectVersion = String(content['version'] || '');
    result.license = String(content['license'] || '');
    result.dependencies = apps;
    result.engines = engines;

    return result;
  }
}
