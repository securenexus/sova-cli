/**
 * PythonParser - Parse Python dependency files.
 *
 * Supported files:
 *  - requirements.txt (pip format)
 *  - poetry.lock (TOML with tree)
 *  - Pipfile / Pipfile.lock (TOML / JSON)
 *  - pyproject.toml (PEP 621, Poetry, Flit, PDM)
 *  - setup.cfg (configparser)
 *  - setup.py (regex, limited)
 *  - uv.lock (TOML with tree)
 *  - environment.yml / conda.yaml (Conda)
 */

import { basename } from 'node:path';
import { parse as parseToml } from '@iarna/toml';
import { parse as parseYaml } from 'yaml';
import { BaseParser } from './base-parser.js';
import { readFileSafe, readJsonSafe } from '../utils/file-reader.js';
import { SCOPE_MAPS } from './scope-mapping.js';
import type { Application, ParsedResult } from '../types/parser.js';

const INSTALL_REQUIRES_RE = /install_requires\s*=\s*\[(.*?)\]/s;
const SETUP_DEP_RE = /['"]([a-zA-Z0-9_-]+)(?:\[.*?\])?(?:([<>=!~]+)([^'"]+))?['"]/g;

const PYPI_PM = 'pypi';

export class PythonParser extends BaseParser {
  supportedLanguages = ['python'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();
    const base = basename(lower);
    try {
      // Match any *requirements*.txt or requirements-*.txt / dev-requirements.txt etc.
      if (base.endsWith('requirements.txt') || /requirements.*\.txt$/.test(base) || /^.*-requirements\.txt$/.test(base)) {
        return this.parseRequirements(filePath);
      }
      if (lower.endsWith('poetry.lock')) return this.parsePoetryLock(filePath);
      if (lower.endsWith('pipfile.lock')) return this.parsePipfileLock(filePath);
      if (base === 'pipfile' || lower.endsWith('/pipfile')) return this.parsePipfile(filePath);
      if (lower.endsWith('pyproject.toml')) return this.parsePyprojectToml(filePath);
      if (lower.endsWith('setup.cfg')) return this.parseSetupCfg(filePath);
      if (lower.endsWith('setup.py')) return this.parseSetupPy(filePath);
      if (lower.endsWith('uv.lock')) return this.parseUvLock(filePath);
      if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return this.parseCondaEnvironment(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'pip');
  }

  // ── requirements.txt ────────────────────────────────────────────

  private parseRequirements(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pip', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    // Branch on filename: *-dev*, dev-*, *-test*, test-* → dev; else runtime.
    const base = basename(filePath).toLowerCase();
    const isDev = /(^|[-_])dev([-_.]|$)/.test(base) || /(^|[-_])test([-_.]|$)/.test(base);
    const scope: Application['scope'] = isDev ? 'dev' : 'runtime';
    const rawScope = isDev ? 'requirements-dev.txt' : 'requirements.txt';

    const apps: Application[] = [];
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('-')) continue;

      const [pkg, ver] = this.parseRequirementLine(line);
      if (pkg) apps.push(this.makeApplication(pkg, ver, scope, PYPI_PM, rawScope));
    }

    result.dependencies = apps;
    return result;
  }

  private parseRequirementLine(line: string): [string, string] {
    // Remove inline comments
    if (line.includes('#')) line = line.split('#')[0].trim();
    // Remove extras [security]
    if (line.includes('[') && line.includes(']')) {
      line = line.replace(/\[.*?\]/g, '');
    }
    // Remove environment markers
    if (line.includes(';')) line = line.split(';')[0].trim();

    // Order matters: check more specific operators first
    for (const op of ['==', '>=', '~=', '<=', '!=', '>', '<', '=']) {
      if (line.includes(op)) {
        const parts = line.split(op);
        const pkg = parts[0].trim().replace(/"/g, '').replace(/~/g, '');
        const ver = (parts[parts.length - 1] || '').trim().replace(/"/g, '');
        return [pkg, ver];
      }
    }

    // Package without version
    return [line.trim(), ''];
  }

  // ── poetry.lock ─────────────────────────────────────────────────

  private parsePoetryLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'poetry', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch { return result; }

    const packages = data['package'] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(packages)) return result;

    const apps: Application[] = [];
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      // poetry.lock category indicates scope (main / dev). Default to runtime.
      const category = String(pkg['category'] || 'main').toLowerCase();
      const scope: Application['scope'] = category === 'dev' ? 'dev' : 'runtime';
      if (name && version) {
        apps.push(this.makeApplication(name, version, scope, PYPI_PM, `poetry-lock-${category}`));
      }
    }

    result.dependencies = apps;
    result.additionalDependencies = this.extractTreeFromPoetryLock(packages);
    return result;
  }

  private extractTreeFromPoetryLock(packages: Array<Record<string, unknown>>): Record<string, string[]> {
    const adjacency: Record<string, string[]> = {};

    // Pass 1: Build resolved_versions lookup
    const resolved: Record<string, string> = {};
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      if (name && version) resolved[name.toLowerCase()] = version;
    }

    // Pass 2: Build adjacency
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      const deps = pkg['dependencies'] as Record<string, unknown> | undefined;
      if (!name || !version || !deps || typeof deps !== 'object') continue;

      const parentKey = this.generateKey(name, version);
      const children: string[] = [];

      for (const depName of Object.keys(deps)) {
        const childVer = resolved[depName.toLowerCase()];
        if (childVer) children.push(this.generateKey(depName, childVer));
      }

      if (children.length > 0) adjacency[parentKey] = children;
    }

    return adjacency;
  }

  // ── Pipfile ─────────────────────────────────────────────────────

  private parsePipfile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pip', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch { return result; }

    const apps: Application[] = [];
    for (const mapping of SCOPE_MAPS.pypi_pipfile) {
      const { section, scope } = mapping;
      const rawScope = (mapping as { rawScope?: string }).rawScope ?? section;
      const sectionDeps = data[section] as Record<string, unknown> | undefined;
      if (!sectionDeps || typeof sectionDeps !== 'object') continue;

      for (const [pkg, spec] of Object.entries(sectionDeps)) {
        let version = '';
        if (typeof spec === 'string') {
          version = spec;
        } else if (spec && typeof spec === 'object') {
          const s = spec as Record<string, unknown>;
          version = String(s['version'] || s['tag'] || s['branch'] || '');
        }
        apps.push(this.makeApplication(pkg, version, scope, PYPI_PM, rawScope));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── Pipfile.lock ────────────────────────────────────────────────

  private parsePipfileLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pip', 'lockfile');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];
    const sectionToScope: Array<[string, Application['scope'], string]> = [
      ['default', 'runtime', 'default'],
      ['develop', 'dev', 'develop'],
    ];
    for (const [section, scope, rawScope] of sectionToScope) {
      const packages = content[section] as Record<string, Record<string, unknown>> | undefined;
      if (!packages || typeof packages !== 'object') continue;

      for (const [pkg, info] of Object.entries(packages)) {
        let version = '';
        if (info && typeof info === 'object' && 'version' in info) {
          version = this.normalizeVersion(String(info['version'] || ''));
        }
        apps.push(this.makeApplication(pkg, version, scope, PYPI_PM, rawScope));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── pyproject.toml ──────────────────────────────────────────────

  private parsePyprojectToml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'poetry', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch { return result; }

    const apps: Application[] = [];

    // PEP 621: project.dependencies
    const project = data['project'] as Record<string, unknown> | undefined;
    if (project) {
      result.packageManager = 'pip';
      const mainDeps = project['dependencies'] as string[] | undefined;
      if (Array.isArray(mainDeps)) {
        for (const dep of mainDeps) {
          const [pkg, ver] = this.parsePep508(dep);
          if (pkg) apps.push(this.makeApplication(pkg, ver, 'runtime', PYPI_PM, 'dependencies'));
        }
      }

      const optDeps = project['optional-dependencies'] as Record<string, string[]> | undefined;
      if (optDeps && typeof optDeps === 'object') {
        for (const [groupName, group] of Object.entries(optDeps)) {
          if (!Array.isArray(group)) continue;
          for (const dep of group) {
            const [pkg, ver] = this.parsePep508(dep);
            if (pkg) apps.push(this.makeApplication(pkg, ver, 'optional', PYPI_PM, `optional-dependencies-${groupName}`));
          }
        }
      }
    }

    // Poetry: tool.poetry.dependencies
    const tool = data['tool'] as Record<string, unknown> | undefined;
    if (tool) {
      const poetry = tool['poetry'] as Record<string, unknown> | undefined;
      if (poetry) {
        result.packageManager = 'poetry';
        for (const mapping of SCOPE_MAPS.pypi_poetry) {
          const { section, scope } = mapping;
          const rawScope = (mapping as { rawScope?: string }).rawScope ?? section;
          const sectionDeps = poetry[section] as Record<string, unknown> | undefined;
          if (sectionDeps && typeof sectionDeps === 'object') {
            apps.push(...this.parsePoetryDeps(sectionDeps, scope, rawScope));
          }
        }
        // Poetry groups: [tool.poetry.group.<name>.dependencies] → dev
        const groups = poetry['group'] as Record<string, Record<string, unknown>> | undefined;
        if (groups && typeof groups === 'object') {
          for (const [groupName, groupData] of Object.entries(groups)) {
            const groupDeps = groupData['dependencies'] as Record<string, unknown> | undefined;
            if (groupDeps) {
              apps.push(...this.parsePoetryDeps(groupDeps, 'dev', `poetry-group-${groupName}`));
            }
          }
        }
      }

      // Flit: tool.flit.metadata.requires
      const flit = tool['flit'] as Record<string, unknown> | undefined;
      if (flit) {
        result.packageManager = 'pip';
        const metadata = flit['metadata'] as Record<string, unknown> | undefined;
        const requires = metadata?.['requires'] as string[] | undefined;
        if (Array.isArray(requires)) {
          for (const dep of requires) {
            const [pkg, ver] = this.parsePep508(dep);
            if (pkg) apps.push(this.makeApplication(pkg, ver, 'runtime', PYPI_PM, 'flit-requires'));
          }
        }
      }
    }

    // Dedupe by key (preserve first occurrence — runtime wins over dev for same pkg+version)
    const seen = new Set<string>();
    const deduped: Application[] = [];
    for (const app of apps) {
      if (seen.has(app.key)) continue;
      seen.add(app.key);
      deduped.push(app);
    }
    result.dependencies = deduped;
    return result;
  }

  private parsePoetryDeps(
    deps: Record<string, unknown>,
    scope: Application['scope'],
    rawScope: string,
  ): Application[] {
    const list: Application[] = [];
    for (const [pkg, spec] of Object.entries(deps)) {
      if (pkg.toLowerCase() === 'python') continue;

      let version = '';
      if (typeof spec === 'string') {
        version = spec;
      } else if (spec && typeof spec === 'object') {
        const s = spec as Record<string, unknown>;
        version = String(s['version'] || s['tag'] || s['branch'] || '');
      }

      list.push(this.makeApplication(pkg, version, scope, PYPI_PM, rawScope));
    }
    return list;
  }

  private parsePep508(depString: string): [string, string] {
    if (!depString) return ['', ''];

    let s = depString;
    if (s.includes(';')) s = s.split(';')[0].trim();
    s = s.replace(/\[.*?\]/g, '');

    const match = s.trim().match(/^([a-zA-Z0-9_.-]+)\s*(.*)/);
    if (!match) return ['', ''];

    const pkg = match[1];
    const versionPart = match[2].trim();

    let version = '';
    if (versionPart) {
      const verMatch = versionPart.match(/([0-9][0-9.]*)/);
      if (verMatch) version = verMatch[1];
    }

    return [pkg, version];
  }

  // ── setup.cfg ───────────────────────────────────────────────────

  private parseSetupCfg(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pip', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Simple INI parser for install_requires / extras_require / setup_requires
    const lines = content.split('\n');
    let inInstallRequires = false;
    let inExtrasRequire = false;
    let inSetupRequires = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line === 'install_requires =' || line.startsWith('install_requires=') || line.startsWith('install_requires =')) {
        inInstallRequires = true;
        inExtrasRequire = false;
        inSetupRequires = false;
        const after = line.split('=').slice(1).join('=').trim();
        if (after) {
          const [pkg, ver] = this.parsePep508(after);
          if (pkg) apps.push(this.makeApplication(pkg, ver, 'runtime', PYPI_PM, 'install_requires'));
        }
        continue;
      }

      if (line === 'setup_requires =' || line.startsWith('setup_requires=') || line.startsWith('setup_requires =')) {
        inSetupRequires = true;
        inInstallRequires = false;
        inExtrasRequire = false;
        const after = line.split('=').slice(1).join('=').trim();
        if (after) {
          const [pkg, ver] = this.parsePep508(after);
          if (pkg) apps.push(this.makeApplication(pkg, ver, 'build', PYPI_PM, 'setup_requires'));
        }
        continue;
      }

      if (line.startsWith('[') && line.endsWith(']')) {
        inInstallRequires = false;
        inSetupRequires = false;
        inExtrasRequire = line === '[options.extras_require]';
        continue;
      }

      if (line.includes('=') && !rawLine.startsWith(' ') && !rawLine.startsWith('\t') && !inInstallRequires && !inSetupRequires) {
        inInstallRequires = false;
        inSetupRequires = false;
      }

      if (inInstallRequires || inExtrasRequire || inSetupRequires) {
        const depLine = line.replace(/,$/, '').trim();
        if ((depLine && !depLine.includes('=')) || depLine.match(/[><=!~]+/)) {
          const [pkg, ver] = this.parsePep508(depLine);
          if (pkg) {
            const scope: Application['scope'] = inSetupRequires ? 'build' : (inExtrasRequire ? 'optional' : 'runtime');
            const rawScope = inSetupRequires ? 'setup_requires' : (inExtrasRequire ? 'extras_require' : 'install_requires');
            apps.push(this.makeApplication(pkg, ver, scope, PYPI_PM, rawScope));
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── setup.py ────────────────────────────────────────────────────

  private parseSetupPy(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'pip', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const match = INSTALL_REQUIRES_RE.exec(content);
    if (match) {
      const requiresContent = match[1];
      let depMatch: RegExpExecArray | null;
      SETUP_DEP_RE.lastIndex = 0;
      while ((depMatch = SETUP_DEP_RE.exec(requiresContent)) !== null) {
        const pkg = depMatch[1];
        const ver = depMatch[3] || '';
        if (pkg) apps.push(this.makeApplication(pkg, ver, 'runtime', PYPI_PM, 'install_requires'));
      }
    }

    // tests_require = [...] → dev
    const testsMatch = /tests_require\s*=\s*\[(.*?)\]/s.exec(content);
    if (testsMatch) {
      const testsContent = testsMatch[1];
      let depMatch: RegExpExecArray | null;
      const re = new RegExp(SETUP_DEP_RE.source, 'g');
      while ((depMatch = re.exec(testsContent)) !== null) {
        const pkg = depMatch[1];
        const ver = depMatch[3] || '';
        if (pkg) apps.push(this.makeApplication(pkg, ver, 'dev', PYPI_PM, 'tests_require'));
      }
    }

    // setup_requires = [...] → build
    const setupMatch = /setup_requires\s*=\s*\[(.*?)\]/s.exec(content);
    if (setupMatch) {
      const setupContent = setupMatch[1];
      let depMatch: RegExpExecArray | null;
      const re = new RegExp(SETUP_DEP_RE.source, 'g');
      while ((depMatch = re.exec(setupContent)) !== null) {
        const pkg = depMatch[1];
        const ver = depMatch[3] || '';
        if (pkg) apps.push(this.makeApplication(pkg, ver, 'build', PYPI_PM, 'setup_requires'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── uv.lock ─────────────────────────────────────────────────────

  private parseUvLock(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'uv', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseToml(content) as Record<string, unknown>;
    } catch { return result; }

    const packages = data['package'] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(packages)) return result;

    const apps: Application[] = [];
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      if (name && version && this.isValidDependency(name, version)) {
        apps.push(this.makeApplication(name, version, 'runtime', PYPI_PM, 'uv-lock'));
      }
    }

    result.dependencies = apps;
    result.additionalDependencies = this.extractTreeFromUvLock(packages);
    return result;
  }

  private extractTreeFromUvLock(packages: Array<Record<string, unknown>>): Record<string, string[]> {
    const adjacency: Record<string, string[]> = {};

    // Pass 1: resolved versions
    const resolved: Record<string, string> = {};
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      if (name && version) resolved[name.toLowerCase()] = version;
    }

    // Pass 2: adjacency
    for (const pkg of packages) {
      const name = String(pkg['name'] || '');
      const version = String(pkg['version'] || '');
      const deps = pkg['dependencies'] as Array<Record<string, unknown> | string> | undefined;
      if (!name || !version || !Array.isArray(deps)) continue;

      const parentKey = this.generateKey(name, version);
      const children: string[] = [];

      for (const depEntry of deps) {
        let depName: string;
        if (typeof depEntry === 'string') {
          depName = depEntry;
        } else if (depEntry && typeof depEntry === 'object') {
          depName = String((depEntry as Record<string, unknown>)['name'] || '');
        } else {
          continue;
        }

        const childVer = resolved[depName.toLowerCase()];
        if (childVer) children.push(this.generateKey(depName, childVer));
      }

      if (children.length > 0) adjacency[parentKey] = children;
    }

    return adjacency;
  }

  // ── Conda environment.yml ───────────────────────────────────────

  private parseCondaEnvironment(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'conda', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch { return result; }
    if (!data) return result;

    const apps: Application[] = [];
    const dependencies = data['dependencies'] as Array<unknown> | undefined;
    if (!Array.isArray(dependencies)) return result;

    for (const dep of dependencies) {
      if (typeof dep === 'string') {
        const [pkg, ver] = this.parseCondaDep(dep);
        if (pkg) apps.push(this.makeApplication(pkg, ver, 'runtime', PYPI_PM, 'conda-dependencies'));
      } else if (dep && typeof dep === 'object') {
        // Handle pip dependencies subsection
        const pipDeps = (dep as Record<string, unknown>)['pip'] as string[] | undefined;
        if (Array.isArray(pipDeps)) {
          for (const pipDep of pipDeps) {
            if (typeof pipDep === 'string') {
              const [pkg, ver] = this.parsePep508(pipDep);
              if (pkg) apps.push(this.makeApplication(pkg, ver, 'runtime', PYPI_PM, 'conda-pip'));
            }
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  private parseCondaDep(depString: string): [string, string] {
    if (!depString) return ['', ''];
    const s = depString.trim();

    for (const sep of ['==', '>=', '<=', '!=', '=', '>', '<']) {
      if (s.includes(sep)) {
        const parts = s.split(sep);
        return [parts[0].trim(), (parts[1] || '').trim()];
      }
    }

    return [s, ''];
  }
}
