/**
 * DockerParser - Enhanced Docker dependency parser.
 *
 * Supported files:
 *  - Dockerfile / Dockerfile.* (FROM images, RUN package installs)
 *  - docker-compose.yml / compose.yml (image references)
 *
 * Extracts:
 *  - Base images with tags, ARG substitution, multi-stage builds
 *  - Package installs from RUN commands (apt-get, apk, yum, dnf, pip, npm, gem, go)
 *  - Service images from docker-compose files
 */

import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/** Regex for FROM instructions: FROM [--platform=...] image[:tag] [AS alias] */
const FROM_RE = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+?)(?::(\S+?))?\s*(?:AS\s+\S+)?\s*$/i;

/** Regex for ARG key=value before FROM */
const ARG_RE = /^\s*ARG\s+(\w+)=(.+)\s*$/i;

/** Package manager install patterns: [regex, captureGroup for packages] */
const INSTALL_PATTERNS: Array<{ re: RegExp; splitChar: string }> = [
  { re: /apt-get\s+install\s+(?:-[a-zA-Z-]+\s+)*(.+)/i, splitChar: ' ' },
  { re: /apk\s+add\s+(?:--[a-zA-Z-]+\s+)*(.+)/i, splitChar: ' ' },
  { re: /yum\s+install\s+(?:-[a-zA-Z]+\s+)*(.+)/i, splitChar: ' ' },
  { re: /dnf\s+install\s+(?:-[a-zA-Z]+\s+)*(.+)/i, splitChar: ' ' },
  { re: /pip3?\s+install\s+(?:--[a-zA-Z-]+(?:\s+\S+)?\s+)*(.+)/i, splitChar: ' ' },
  { re: /npm\s+install\s+(?:-[gDSEO]+\s+)*(?:--[a-zA-Z-]+\s+)*(.+)/i, splitChar: ' ' },
  { re: /gem\s+install\s+(.+)/i, splitChar: ' ' },
  { re: /go\s+install\s+(.+)/i, splitChar: ' ' },
];

export class DockerParser extends BaseParser {
  supportedLanguages = ['docker'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();
    const base = basename(lower);

    try {
      if (base === 'docker-compose.yml' || base === 'docker-compose.yaml' || base === 'compose.yml' || base === 'compose.yaml') {
        return this.parseDockerCompose(filePath);
      }
      if (base.startsWith('dockerfile') || base.endsWith('.dockerfile')) {
        return this.parseDockerfile(filePath);
      }
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'docker');
  }

  // ── Dockerfile ────────────────────────────────────────────────

  private parseDockerfile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'docker', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Collect ARG values for variable substitution
    const args: Record<string, string> = {};

    // Join backslash-continued lines into single logical lines
    const logicalLines = this.joinContinuationLines(content);

    for (const line of logicalLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse ARG declarations
      const argMatch = ARG_RE.exec(trimmed);
      if (argMatch) {
        args[argMatch[1]] = argMatch[2].trim();
        continue;
      }

      // Parse FROM instructions
      const fromMatch = FROM_RE.exec(trimmed);
      if (fromMatch) {
        let image = fromMatch[1];
        let tag = fromMatch[2] || 'latest';

        // Substitute ARG variables: ${VAR} or $VAR
        image = this.substituteArgs(image, args);
        tag = this.substituteArgs(tag, args);

        // Skip "scratch" (empty base image)
        if (image === 'scratch') continue;

        apps.push(this.makeApplication(image, tag, 'runtime', 'docker'));
        continue;
      }

      // Parse RUN commands for package installs
      if (/^\s*RUN\s+/i.test(trimmed)) {
        const runBody = trimmed.replace(/^\s*RUN\s+/i, '');
        apps.push(...this.parseRunCommand(runBody));
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Join lines that end with backslash into single logical lines.
   */
  private joinContinuationLines(content: string): string[] {
    const rawLines = content.split('\n');
    const logical: string[] = [];
    let buffer = '';

    for (const raw of rawLines) {
      const trimmed = raw.trimEnd();
      if (trimmed.endsWith('\\')) {
        buffer += trimmed.slice(0, -1) + ' ';
      } else {
        buffer += trimmed;
        logical.push(buffer);
        buffer = '';
      }
    }
    if (buffer) logical.push(buffer);

    return logical;
  }

  /**
   * Substitute ${VAR} and $VAR references from ARG values.
   */
  private substituteArgs(value: string, args: Record<string, string>): string {
    let result = value;
    // ${VAR} form
    result = result.replace(/\$\{(\w+)\}/g, (_, name) => args[name] || '');
    // $VAR form (only if not followed by {)
    result = result.replace(/\$(\w+)/g, (_, name) => args[name] || '');
    return result;
  }

  /**
   * Parse a RUN command body for package install commands.
   * Handles && chaining.
   */
  private parseRunCommand(runBody: string): Application[] {
    const apps: Application[] = [];

    // Split on && to get individual commands
    const commands = runBody.split('&&').map(c => c.trim());

    for (const cmd of commands) {
      for (const pattern of INSTALL_PATTERNS) {
        const match = pattern.re.exec(cmd);
        if (!match) continue;

        const packagesStr = match[1].trim();
        // Split package list and clean up
        const packages = packagesStr
          .split(/\s+/)
          .map(p => p.trim())
          .filter(p => p && !p.startsWith('-') && !p.startsWith('\\') && !p.startsWith('|') && !p.startsWith('>') && p !== '&&');

        for (const pkg of packages) {
          // Separate package name from version (package=version or package==version)
          const eqMatch = pkg.match(/^([^=<>!~]+)[=<>!~]+(.+)$/);
          if (eqMatch) {
            apps.push(this.makeApplication(eqMatch[1], eqMatch[2], 'runtime', 'docker'));
          } else {
            apps.push(this.makeApplication(pkg, '', 'runtime', 'docker'));
          }
        }
        break; // One pattern match per command segment is enough
      }
    }

    return apps;
  }

  // ── docker-compose.yml ────────────────────────────────────────

  private parseDockerCompose(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'docker', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    let data: Record<string, unknown>;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch {
      return result;
    }
    if (!data) return result;

    const apps: Application[] = [];
    const services = data['services'] as Record<string, Record<string, unknown>> | undefined;
    if (!services || typeof services !== 'object') return result;

    for (const [_serviceName, serviceConfig] of Object.entries(services)) {
      if (!serviceConfig || typeof serviceConfig !== 'object') continue;

      const image = serviceConfig['image'];
      if (typeof image === 'string' && image) {
        const { name, tag } = this.parseImageReference(image);
        apps.push(this.makeApplication(name, tag, 'runtime', 'docker'));
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Parse a Docker image reference into name and tag.
   * e.g. "nginx:1.25-alpine" → { name: "nginx", tag: "1.25-alpine" }
   * e.g. "ghcr.io/owner/image:v1.0" → { name: "ghcr.io/owner/image", tag: "v1.0" }
   */
  private parseImageReference(ref: string): { name: string; tag: string } {
    const trimmed = ref.trim();

    // Handle digest references: image@sha256:...
    if (trimmed.includes('@sha256:')) {
      const parts = trimmed.split('@sha256:');
      return { name: parts[0], tag: 'sha256:' + (parts[1] || '') };
    }

    // Split on last colon, but be careful with registry ports (e.g. registry:5000/image)
    const slashIdx = trimmed.lastIndexOf('/');
    const colonIdx = trimmed.lastIndexOf(':');

    // If colon is after the last slash, it's a tag separator
    if (colonIdx > slashIdx) {
      return {
        name: trimmed.substring(0, colonIdx),
        tag: trimmed.substring(colonIdx + 1),
      };
    }

    return { name: trimmed, tag: 'latest' };
  }
}
