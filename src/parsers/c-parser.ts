/**
 * CParser - Parse C/C++ dependency files.
 *
 * Supported files:
 *  - vcpkg.json (JSON dependencies array)
 *  - conanfile.txt ([requires] section with package/version entries)
 *  - CMakeLists.txt (find_package and FetchContent_Declare)
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import { readJsonSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/** find_package(Name VERSION 1.0.0) or find_package(Name 1.0.0) */
const FIND_PKG_RE = /find_package\s*\(\s*(\w+)(?:\s+(?:VERSION\s+)?([\d][\d.]*[\w]*))?/gi;

/** FetchContent_Declare(Name GIT_REPOSITORY url GIT_TAG version) */
const FETCH_CONTENT_RE = /FetchContent_Declare\s*\(\s*(\w+)[^)]*?GIT_TAG\s+([^\s)]+)/gi;

export class CParser extends BaseParser {
  supportedLanguages = ['c'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('vcpkg.json')) return this.parseVcpkgJson(filePath);
      if (lower.endsWith('conanfile.txt')) return this.parseConanfileTxt(filePath);
      if (lower.endsWith('cmakelists.txt')) return this.parseCMakeLists(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'vcpkg');
  }

  // ── vcpkg.json ───────────────────────────────────────────────

  private parseVcpkgJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'vcpkg', 'manifest');
    const data = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!data) return result;

    result.projectName = String(data['name'] || '');
    result.projectVersion = String(data['version-string'] || data['version'] || data['version-semver'] || '');
    result.license = String(data['license'] || '');

    const apps: Application[] = [];

    const dependencies = data['dependencies'] as Array<unknown> | undefined;
    if (Array.isArray(dependencies)) {
      for (const dep of dependencies) {
        if (typeof dep === 'string') {
          apps.push(this.makeApplication(dep, '', 'runtime', 'vcpkg'));
        } else if (dep && typeof dep === 'object') {
          const d = dep as Record<string, unknown>;
          const name = String(d['name'] || '');
          const version = String(d['version>='] || d['version-string'] || '');
          if (name) {
            apps.push(this.makeApplication(name, version, 'runtime', 'vcpkg'));
          }
        }
      }
    }

    // Also check overrides for pinned versions
    const overrides = data['overrides'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(overrides)) {
      for (const ov of overrides) {
        if (ov && typeof ov === 'object') {
          const name = String(ov['name'] || '');
          const version = String(ov['version'] || ov['version-string'] || '');
          if (name) {
            apps.push(this.makeApplication(name, version, 'runtime', 'vcpkg'));
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── conanfile.txt ────────────────────────────────────────────

  private parseConanfileTxt(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'conan', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    let inRequires = false;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();

      // Section headers
      if (line.startsWith('[')) {
        inRequires = line.toLowerCase() === '[requires]';
        continue;
      }

      if (!inRequires) continue;
      if (!line || line.startsWith('#')) continue;

      // Format: package/version or package/version@user/channel
      const parts = line.split('/');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        // Version may contain @user/channel suffix; strip it
        let version = parts.slice(1).join('/');
        const atIdx = version.indexOf('@');
        if (atIdx !== -1) {
          version = version.substring(0, atIdx);
        }
        version = version.trim();
        apps.push(this.makeApplication(name, version, 'runtime', 'conan'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── CMakeLists.txt ───────────────────────────────────────────

  private parseCMakeLists(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'cmake', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Extract project name: project(Name VERSION 1.0)
    const projectMatch = content.match(/project\s*\(\s*(\w+)(?:\s+VERSION\s+([\d.]+))?/i);
    if (projectMatch) {
      result.projectName = projectMatch[1];
      if (projectMatch[2]) {
        result.projectVersion = projectMatch[2];
      }
    }

    // find_package patterns
    FIND_PKG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FIND_PKG_RE.exec(content)) !== null) {
      const name = match[1];
      const version = match[2] || '';

      // Skip CMake built-in modules
      if (this.isBuiltinCMakeModule(name)) continue;

      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(name, version, 'runtime', 'cmake'));
      }
    }

    // FetchContent_Declare patterns
    FETCH_CONTENT_RE.lastIndex = 0;
    while ((match = FETCH_CONTENT_RE.exec(content)) !== null) {
      const name = match[1];
      let version = match[2];

      // If GIT_TAG is a version like v1.0.0, strip the v prefix
      if (version.startsWith('v')) {
        version = version.slice(1);
      }

      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(name, version, 'runtime', 'cmake'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Check if a CMake find_package name is a built-in module.
   */
  private isBuiltinCMakeModule(name: string): boolean {
    const builtins = new Set([
      'Threads', 'OpenMP', 'MPI', 'CUDA', 'OpenCL',
      'PkgConfig', 'GTest', 'Python', 'Python3',
      'Java', 'JNI', 'BLAS', 'LAPACK',
    ]);
    return builtins.has(name);
  }
}
