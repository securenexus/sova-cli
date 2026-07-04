/**
 * JavaParser - Parse Java/JVM dependency files (file-based only, no CLI).
 *
 * Supported files:
 *  - pom.xml (Maven, with property resolution)
 *  - build.gradle / build.gradle.kts (Gradle Groovy & Kotlin DSL)
 *  - gradle.lockfile
 *
 * Does NOT invoke mvn or gradle CLI.
 */

import { createSafeXmlParser } from '../utils/safe-xml-parser.js';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';
import { SCOPE_MAPS, type SectionMapping } from './scope-mapping.js';

/**
 * Gradle dependency declaration patterns.
 * Matches: implementation 'group:artifact:version'
 *          implementation("group:artifact:version")
 *          compile "group:artifact:version"
 *
 * Capture group 1 = configuration name (so we can map scope).
 */
const GRADLE_DEP_RE = /\b(implementation|compile|api|testImplementation|testCompile|runtimeOnly|compileOnly|annotationProcessor|kapt|classpath|testRuntimeOnly|testCompileOnly)\s*[\s(]+['"]([\w.\-]+):([\w.\-]+):([\w.\-+]+)['"]/g;

/**
 * Gradle dependency with group/name/version separate args.
 * Matches: implementation group: 'com.google', name: 'guava', version: '31.1'
 */
const GRADLE_MAP_DEP_RE = /\b(implementation|compile|api|testImplementation|testCompile|runtimeOnly|compileOnly|annotationProcessor|kapt|classpath|testRuntimeOnly|testCompileOnly)\s+(?:group:\s*['"]([^'"]+)['"],?\s*name:\s*['"]([^'"]+)['"],?\s*version:\s*['"]([^'"]+)['"])/g;

/** Look up a Gradle configuration name in SCOPE_MAPS.gradle. */
function gradleScopeFor(config: string): { scope: Application['scope']; rawScope?: string } {
  for (const m of SCOPE_MAPS.gradle as readonly SectionMapping[]) {
    if (m.section === config) return { scope: m.scope, rawScope: m.rawScope };
  }
  return { scope: 'runtime' };
}

/** Look up a Maven scope element value in SCOPE_MAPS.maven. */
function mavenScopeFor(rawScope: string): { scope: Application['scope']; rawScope?: string } {
  const s = (rawScope || 'compile').toLowerCase();
  for (const m of SCOPE_MAPS.maven as readonly SectionMapping[]) {
    if (m.section === s) return { scope: m.scope, rawScope: m.rawScope };
  }
  return { scope: 'runtime', rawScope: s };
}

export class JavaParser extends BaseParser {
  supportedLanguages = ['java', 'groovy', 'kotlin'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('pom.xml')) return this.parsePomXml(filePath);
      if (lower.endsWith('build.gradle.kts')) return this.parseBuildGradle(filePath);
      if (lower.endsWith('build.gradle')) return this.parseBuildGradle(filePath);
      if (lower.endsWith('gradle.lockfile')) return this.parseGradleLockfile(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'maven');
  }

  // ── pom.xml ───────────────────────────────────────────────────

  private parsePomXml(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'maven', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const parser = createSafeXmlParser({
      removeNSPrefix: true,
      isArray: (name) => name === 'dependency' || name === 'exclusion',
    });

    let xml: Record<string, unknown>;
    try {
      xml = parser.parse(content) as Record<string, unknown>;
    } catch {
      return result;
    }

    const project = xml['project'] as Record<string, unknown> | undefined;
    if (!project) return result;

    // Extract project metadata
    result.projectName = String(project['artifactId'] || '');
    result.projectVersion = String(project['version'] || '');

    // Collect properties for ${property} resolution
    const properties = this.collectProperties(project);

    // Extract dependencies from all sections
    const apps: Application[] = [];

    // Direct <dependencies>
    const depsSection = project['dependencies'] as Record<string, unknown> | undefined;
    if (depsSection) {
      apps.push(...this.extractMavenDeps(depsSection, properties));
    }

    // <dependencyManagement><dependencies>
    const depMgmt = project['dependencyManagement'] as Record<string, unknown> | undefined;
    if (depMgmt) {
      const managedDeps = depMgmt['dependencies'] as Record<string, unknown> | undefined;
      if (managedDeps) {
        apps.push(...this.extractMavenDeps(managedDeps, properties));
      }
    }

    // <build><plugins> — plugin dependencies
    const build = project['build'] as Record<string, unknown> | undefined;
    if (build) {
      const plugins = build['plugins'] as Record<string, unknown> | undefined;
      if (plugins) {
        const pluginList = (plugins['plugin'] || []) as Array<Record<string, unknown>> | Record<string, unknown>;
        const pluginsArr = Array.isArray(pluginList) ? pluginList : [pluginList];
        for (const plugin of pluginsArr) {
          if (!plugin || typeof plugin !== 'object') continue;
          const groupId = this.resolveProperty(String(plugin['groupId'] || ''), properties);
          const artifactId = this.resolveProperty(String(plugin['artifactId'] || ''), properties);
          const version = this.resolveProperty(String(plugin['version'] || ''), properties);
          if (artifactId) {
            const fullName = groupId ? `${groupId}:${artifactId}` : artifactId;
            apps.push(this.makeApplication(fullName, version, 'runtime', 'maven'));
          }
        }
      }
    }

    // Parent POM
    const parent = project['parent'] as Record<string, unknown> | undefined;
    if (parent) {
      const groupId = this.resolveProperty(String(parent['groupId'] || ''), properties);
      const artifactId = this.resolveProperty(String(parent['artifactId'] || ''), properties);
      const version = this.resolveProperty(String(parent['version'] || ''), properties);
      if (artifactId) {
        const fullName = groupId ? `${groupId}:${artifactId}` : artifactId;
        apps.push(this.makeApplication(fullName, version, 'runtime', 'maven'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Collect <properties> from project and parent.
   */
  private collectProperties(project: Record<string, unknown>): Record<string, string> {
    const props: Record<string, string> = {};

    // Project-level properties
    const propsSection = project['properties'] as Record<string, unknown> | undefined;
    if (propsSection && typeof propsSection === 'object') {
      for (const [key, value] of Object.entries(propsSection)) {
        if (typeof value === 'string' || typeof value === 'number') {
          props[key] = String(value);
        }
      }
    }

    // Built-in properties
    if (project['version']) props['project.version'] = String(project['version']);
    if (project['groupId']) props['project.groupId'] = String(project['groupId']);
    if (project['artifactId']) props['project.artifactId'] = String(project['artifactId']);

    return props;
  }

  /**
   * Resolve ${property} references in a string.
   */
  private resolveProperty(value: string, properties: Record<string, string>): string {
    if (!value || !value.includes('${')) return value;

    return value.replace(/\$\{([^}]+)\}/g, (_, propName) => {
      return properties[propName] || '';
    });
  }

  /**
   * Extract dependencies from a <dependencies> XML section.
   */
  private extractMavenDeps(depsSection: Record<string, unknown>, properties: Record<string, string>): Application[] {
    const result: Application[] = [];
    const depList = depsSection['dependency'];
    if (!depList) return result;

    const deps = Array.isArray(depList) ? depList : [depList];

    for (const dep of deps) {
      if (!dep || typeof dep !== 'object') continue;
      const d = dep as Record<string, unknown>;

      const groupId = this.resolveProperty(String(d['groupId'] || ''), properties);
      const artifactId = this.resolveProperty(String(d['artifactId'] || ''), properties);
      const version = this.resolveProperty(String(d['version'] || ''), properties);
      const rawScopeRaw = d['scope'] != null ? String(d['scope']) : 'compile';

      if (!artifactId) continue;

      const fullName = groupId ? `${groupId}:${artifactId}` : artifactId;
      const { scope, rawScope } = mavenScopeFor(rawScopeRaw);
      result.push(this.makeApplication(fullName, version, scope, 'maven', rawScope));
    }

    return result;
  }

  // ── build.gradle / build.gradle.kts ───────────────────────────

  private parseBuildGradle(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'gradle', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Match string notation: implementation 'group:artifact:version'
    GRADLE_DEP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = GRADLE_DEP_RE.exec(content)) !== null) {
      const config = match[1];
      const group = match[2];
      const artifact = match[3];
      const version = match[4];
      const fullName = `${group}:${artifact}`;
      const { scope, rawScope } = gradleScopeFor(config);
      const app = this.makeApplication(fullName, version, scope, 'gradle', rawScope);
      if (!seen.has(app.key)) {
        seen.add(app.key);
        apps.push(app);
      }
    }

    // Match map notation: implementation group: '...', name: '...', version: '...'
    GRADLE_MAP_DEP_RE.lastIndex = 0;
    while ((match = GRADLE_MAP_DEP_RE.exec(content)) !== null) {
      const config = match[1];
      const group = match[2];
      const artifact = match[3];
      const version = match[4];
      const fullName = `${group}:${artifact}`;
      const { scope, rawScope } = gradleScopeFor(config);
      const app = this.makeApplication(fullName, version, scope, 'gradle', rawScope);
      if (!seen.has(app.key)) {
        seen.add(app.key);
        apps.push(app);
      }
    }

    // Try to extract buildscript / plugins versions
    const pluginRe = /id\s*\(?['"]([^'"]+)['"]\)?\s*version\s*['"]([^'"]+)['"]/g;
    while ((match = pluginRe.exec(content)) !== null) {
      const pluginId = match[1];
      const version = match[2];
      const app = this.makeApplication(pluginId, version, 'runtime', 'gradle');
      if (!seen.has(app.key)) {
        seen.add(app.key);
        apps.push(app);
      }
    }

    result.dependencies = apps;
    return result;
  }

  // ── gradle.lockfile ───────────────────────────────────────────

  private parseGradleLockfile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'gradle', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      // Skip comments and empty lines
      if (!line || line.startsWith('#') || line.startsWith('empty=')) continue;

      // Format: group:artifact:version=configurations
      const eqIdx = line.indexOf('=');
      const gavPart = eqIdx > 0 ? line.substring(0, eqIdx) : line;
      const parts = gavPart.split(':');
      if (parts.length >= 3) {
        const group = parts[0];
        const artifact = parts[1];
        const version = parts[2];
        const fullName = `${group}:${artifact}`;
        apps.push(this.makeApplication(fullName, version, 'runtime', 'gradle'));
      }
    }

    result.dependencies = apps;
    return result;
  }
}
