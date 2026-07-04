/**
 * DotNetParser - Parse .NET/NuGet dependency files.
 *
 * Supported files:
 *  - packages.config (XML)
 *  - *.csproj / *.fsproj / *.vbproj (XML PackageReference)
 *  - packages.lock.json (JSON with framework tree)
 *  - *.nuspec (XML dependency metadata)
 *  - *.deps.json (runtime dependencies)
 */

import { createSafeXmlParser } from '../utils/safe-xml-parser.js';
import { BaseParser } from './base-parser.js';
import { readFileSafe, readJsonSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

export class DotNetParser extends BaseParser {
  supportedLanguages = ['dotNet'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('packages.config')) return this.parsePackagesConfig(filePath);
      if (lower.endsWith('.csproj') || lower.endsWith('.fsproj') || lower.endsWith('.vbproj')) return this.parseCsproj(filePath);
      if (lower.endsWith('packages.lock.json')) return this.parsePackagesLockJson(filePath);
      if (lower.endsWith('.nuspec')) return this.parseNuspec(filePath);
      if (lower.endsWith('.deps.json')) return this.parseDepsJson(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'nuget');
  }

  // ── packages.config ───────────────────────────────────────────

  private parsePackagesConfig(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'nuget', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const parser = createSafeXmlParser({
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'package',
    });

    let xml: Record<string, unknown>;
    try {
      xml = parser.parse(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    const packages = xml['packages'] as Record<string, unknown> | undefined;
    if (!packages) return result;

    const pkgList = packages['package'];
    if (!pkgList) return result;

    const pkgArr = Array.isArray(pkgList) ? pkgList : [pkgList];
    const apps: Application[] = [];

    for (const pkg of pkgArr) {
      if (!pkg || typeof pkg !== 'object') continue;
      const p = pkg as Record<string, unknown>;
      const id = String(p['@_id'] || '');
      const version = String(p['@_version'] || '');
      if (id) {
        apps.push(this.makeApplication(id, version, 'runtime', 'nuget'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── *.csproj (PackageReference) ───────────────────────────────

  private parseCsproj(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'nuget', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const parser = createSafeXmlParser({
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'PackageReference' || name === 'ItemGroup',
    });

    let xml: Record<string, unknown>;
    try {
      xml = parser.parse(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    const project = xml['Project'] as Record<string, unknown> | undefined;
    if (!project) return result;

    const apps: Application[] = [];

    // Extract PropertyGroup for variable substitution (basic)
    const properties: Record<string, string> = {};
    const propGroups = project['PropertyGroup'];
    if (propGroups) {
      const groups = Array.isArray(propGroups) ? propGroups : [propGroups];
      for (const group of groups) {
        if (group && typeof group === 'object') {
          for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
            if (typeof value === 'string' || typeof value === 'number') {
              properties[key] = String(value);
            }
          }
        }
      }
    }

    // Iterate ItemGroups
    const itemGroups = project['ItemGroup'];
    if (!itemGroups) return result;

    const groups = Array.isArray(itemGroups) ? itemGroups : [itemGroups];
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue;
      const g = group as Record<string, unknown>;

      const refs = g['PackageReference'];
      if (!refs) continue;

      const refArr = Array.isArray(refs) ? refs : [refs];
      for (const ref of refArr) {
        if (!ref || typeof ref !== 'object') continue;
        const r = ref as Record<string, unknown>;

        const include = String(r['@_Include'] || r['@_Update'] || '');
        let version = String(r['@_Version'] || r['Version'] || '');

        // Resolve $(Property) references
        if (version.startsWith('$(') && version.endsWith(')')) {
          const propName = version.slice(2, -1);
          version = properties[propName] || version;
        }

        if (include) {
          apps.push(this.makeApplication(include, version, 'runtime', 'nuget'));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── packages.lock.json ────────────────────────────────────────

  private parsePackagesLockJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'nuget', 'lockfile');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];
    const adjacency: Record<string, string[]> = {};

    // Build resolved version lookup across all frameworks
    const resolvedVersions: Record<string, string> = {};

    const dependencies = content['dependencies'] as Record<string, Record<string, Record<string, unknown>>> | undefined;
    if (!dependencies || typeof dependencies !== 'object') return result;

    // First pass: collect all resolved versions
    for (const [_framework, frameworkDeps] of Object.entries(dependencies)) {
      if (!frameworkDeps || typeof frameworkDeps !== 'object') continue;

      for (const [pkgName, pkgInfo] of Object.entries(frameworkDeps)) {
        if (!pkgInfo || typeof pkgInfo !== 'object') continue;
        const resolved = String(pkgInfo['resolved'] || '');
        if (resolved) {
          resolvedVersions[pkgName.toLowerCase()] = resolved;
        }
      }
    }

    // Second pass: extract dependencies and tree
    const seen = new Set<string>();
    for (const [_framework, frameworkDeps] of Object.entries(dependencies)) {
      if (!frameworkDeps || typeof frameworkDeps !== 'object') continue;

      for (const [pkgName, pkgInfo] of Object.entries(frameworkDeps)) {
        if (!pkgInfo || typeof pkgInfo !== 'object') continue;

        const resolved = String(pkgInfo['resolved'] || '');
        if (!resolved) continue;

        const key = this.generateKey(pkgName, resolved);
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(pkgName, resolved, 'runtime', 'nuget'));
        }

        // Extract child dependencies
        const pkgDeps = pkgInfo['dependencies'] as Record<string, string> | undefined;
        if (pkgDeps && typeof pkgDeps === 'object') {
          const children: string[] = [];
          for (const [childName, childVerRange] of Object.entries(pkgDeps)) {
            const childResolved = resolvedVersions[childName.toLowerCase()] || String(childVerRange);
            children.push(this.generateKey(childName, childResolved));
          }
          if (children.length > 0) {
            adjacency[key] = children;
          }
        }
      }
    }

    result.dependencies = apps;
    result.additionalDependencies = adjacency;
    return result;
  }

  // ── *.nuspec ──────────────────────────────────────────────────

  private parseNuspec(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'nuget', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const parser = createSafeXmlParser({
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      isArray: (name) => name === 'dependency' || name === 'group',
    });

    let xml: Record<string, unknown>;
    try {
      xml = parser.parse(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    const pkg = xml['package'] as Record<string, unknown> | undefined;
    if (!pkg) return result;

    const metadata = pkg['metadata'] as Record<string, unknown> | undefined;
    if (!metadata) return result;

    // Extract metadata
    result.projectName = String(metadata['id'] || '');
    result.projectVersion = String(metadata['version'] || '');
    result.license = String(metadata['licenseUrl'] || metadata['license'] || '');

    const apps: Application[] = [];
    const depsSection = metadata['dependencies'] as Record<string, unknown> | undefined;
    if (!depsSection) {
      result.dependencies = apps;
      return result;
    }

    // Dependencies can be directly under <dependencies> or grouped
    // Direct dependencies
    const directDeps = depsSection['dependency'];
    if (directDeps) {
      const depArr = Array.isArray(directDeps) ? directDeps : [directDeps];
      for (const dep of depArr) {
        if (!dep || typeof dep !== 'object') continue;
        const d = dep as Record<string, unknown>;
        const id = String(d['@_id'] || '');
        const version = String(d['@_version'] || '');
        if (id) apps.push(this.makeApplication(id, this.extractLowerBoundVersion(version) || version, 'runtime', 'nuget'));
      }
    }

    // Grouped dependencies: <group targetFramework="...">
    const groups = depsSection['group'];
    if (groups) {
      const groupArr = Array.isArray(groups) ? groups : [groups];
      for (const group of groupArr) {
        if (!group || typeof group !== 'object') continue;
        const g = group as Record<string, unknown>;
        const groupDeps = g['dependency'];
        if (!groupDeps) continue;

        const gdArr = Array.isArray(groupDeps) ? groupDeps : [groupDeps];
        for (const dep of gdArr) {
          if (!dep || typeof dep !== 'object') continue;
          const d = dep as Record<string, unknown>;
          const id = String(d['@_id'] || '');
          const version = String(d['@_version'] || '');
          if (id) apps.push(this.makeApplication(id, this.extractLowerBoundVersion(version) || version, 'runtime', 'nuget'));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── *.deps.json ───────────────────────────────────────────────

  private parseDepsJson(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'nuget', 'lockfile');
    const content = readJsonSafe(filePath) as Record<string, unknown> | null;
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // .deps.json has "libraries" dict with keys like "PackageName/Version"
    const libraries = content['libraries'] as Record<string, Record<string, unknown>> | undefined;
    if (libraries && typeof libraries === 'object') {
      for (const [libKey, libInfo] of Object.entries(libraries)) {
        if (!libInfo || typeof libInfo !== 'object') continue;

        // Key format: "PackageName/Version"
        const slashIdx = libKey.indexOf('/');
        if (slashIdx <= 0) continue;

        const pkgName = libKey.substring(0, slashIdx);
        const version = libKey.substring(slashIdx + 1);

        // Only include packages, not projects
        const libType = String(libInfo['type'] || '');
        if (libType === 'project') continue;

        const key = this.generateKey(pkgName, version);
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(pkgName, version, 'runtime', 'nuget'));
        }
      }
    }

    // Also extract from runtimeTarget.dependencies if available
    const runtimeTarget = content['runtimeTarget'] as Record<string, unknown> | undefined;
    const targets = content['targets'] as Record<string, Record<string, unknown>> | undefined;
    if (targets && typeof targets === 'object') {
      for (const [_targetName, targetDeps] of Object.entries(targets)) {
        if (!targetDeps || typeof targetDeps !== 'object') continue;

        for (const [depKey, _depInfo] of Object.entries(targetDeps)) {
          const slashIdx = depKey.indexOf('/');
          if (slashIdx <= 0) continue;

          const pkgName = depKey.substring(0, slashIdx);
          const version = depKey.substring(slashIdx + 1);

          const key = this.generateKey(pkgName, version);
          if (!seen.has(key)) {
            seen.add(key);
            apps.push(this.makeApplication(pkgName, version, 'runtime', 'nuget'));
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }
}
