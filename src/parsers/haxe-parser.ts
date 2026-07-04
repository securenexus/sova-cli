/**
 * HaxeParser - Parse Haxe dependency files.
 *
 * Supported files:
 *  - haxelib.json (JSON dependencies object mapping name -> version)
 */

import { BaseParser } from './base-parser.js';
import { readJsonSafe } from '../utils/file-reader.js';
import type { ParsedResult } from '../types/parser.js';
import type { Application } from '../types/parser.js';

export class HaxeParser extends BaseParser {
  supportedLanguages = ['haxe'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('haxelib.json')) return this.parseHaxelibJson(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'haxelib');
  }

  private parseHaxelibJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'haxelib', 'manifest');
    const data = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!data) return result;

    // Extract project metadata
    result.projectName = String(data['name'] || '');
    result.projectVersion = String(data['version'] || '');
    result.license = String(data['license'] || '');

    const apps: Application[] = [];

    // dependencies is a map of name -> version
    const dependencies = data['dependencies'] as Record<string, string> | undefined;
    if (dependencies && typeof dependencies === 'object') {
      for (const [name, version] of Object.entries(dependencies)) {
        const ver = typeof version === 'string' ? version : '';
        // Haxelib uses empty string or "" for "latest"
        apps.push(this.makeApplication(name, ver, 'runtime', 'haxelib'));
      }
    }

    result.dependencies = apps;
    return result;
  }
}
