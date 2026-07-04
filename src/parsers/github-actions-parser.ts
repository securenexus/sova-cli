/**
 * GithubActionsParser - Parse GitHub Actions workflow files for action and image dependencies.
 *
 * Detects:
 *  - `uses: owner/repo@version` (action references)
 *  - `uses: docker://image:tag` (Docker action references)
 *  - `container: image:tag` (job-level container)
 *  - `services: { name: { image: ... } }` (service containers)
 */

// SECURITY NOTE: yaml v2.x is safe by default (no custom tags, no code execution).
// Do NOT pass customTags or schema overrides without security review.
import { parse as parseYaml } from 'yaml';
import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { Application, ParsedResult } from '../types/parser.js';

/** Regex for action references: uses: owner/repo@version or uses: owner/repo/path@version */
const ACTION_USES_RE = /uses:\s*['"]?([^'"#\s]+)['"]?/g;

/** Regex for docker:// references: uses: docker://image:tag */
const DOCKER_USES_RE = /^docker:\/\/(.+)$/;

export class GithubActionsParser extends BaseParser {
  supportedLanguages = ['github-actions'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    try {
      return this.parseWorkflow(filePath);
    } catch {
      return this.createEmptyResult(filePath, 'github-actions');
    }
  }

  private parseWorkflow(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'github-actions', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    // Parse YAML for structured access to container/services
    let data: Record<string, unknown> | null = null;
    try {
      data = parseYaml(content) as Record<string, unknown>;
    } catch {
      // Fall back to regex-only parsing
    }

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Method 1: Extract `uses:` references via regex (reliable for all formats)
    ACTION_USES_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ACTION_USES_RE.exec(content)) !== null) {
      const ref = match[1].trim();
      const parsed = this.parseUsesReference(ref);
      if (parsed) {
        const key = this.generateKey(parsed.name, parsed.version);
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(parsed.name, parsed.version, 'runtime', 'github_actions'));
        }
      }
    }

    // Method 2: Extract container images from YAML structure
    if (data) {
      const jobs = data['jobs'] as Record<string, Record<string, unknown>> | undefined;
      if (jobs && typeof jobs === 'object') {
        for (const [_jobName, jobConfig] of Object.entries(jobs)) {
          if (!jobConfig || typeof jobConfig !== 'object') continue;

          // Job-level container
          const container = jobConfig['container'];
          if (container) {
            const images = this.extractContainerImages(container);
            for (const img of images) {
              const key = this.generateKey(img.name, img.version);
              if (!seen.has(key)) {
                seen.add(key);
                apps.push(this.makeApplication(img.name, img.version, 'runtime', 'github_actions'));
              }
            }
          }

          // Job-level services
          const services = jobConfig['services'] as Record<string, unknown> | undefined;
          if (services && typeof services === 'object') {
            for (const [_serviceName, serviceConfig] of Object.entries(services)) {
              if (!serviceConfig || typeof serviceConfig !== 'object') continue;
              const s = serviceConfig as Record<string, unknown>;
              const image = s['image'];
              if (typeof image === 'string' && image) {
                const parsed = this.parseImageReference(image);
                const key = this.generateKey(parsed.name, parsed.version);
                if (!seen.has(key)) {
                  seen.add(key);
                  apps.push(this.makeApplication(parsed.name, parsed.version, 'runtime', 'github_actions'));
                }
              }
            }
          }
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Parse a `uses:` reference into name and version.
   *
   * Formats:
   *  - owner/repo@version → { name: "owner/repo", version }
   *  - owner/repo/path@version → { name: "owner/repo", version }
   *  - docker://image:tag → { name: "image", version: "tag" }
   *  - ./ (local action) → null
   */
  private parseUsesReference(ref: string): { name: string; version: string } | null {
    if (!ref) return null;

    // Skip local action references
    if (ref.startsWith('./') || ref.startsWith('../')) return null;

    // Docker reference
    const dockerMatch = DOCKER_USES_RE.exec(ref);
    if (dockerMatch) {
      return this.parseImageReference(dockerMatch[1]);
    }

    // Action reference: owner/repo@version or owner/repo/path@version
    const atIdx = ref.lastIndexOf('@');
    if (atIdx <= 0) return null;

    const actionPath = ref.substring(0, atIdx);
    const version = ref.substring(atIdx + 1);

    // Normalize to owner/repo (strip sub-paths)
    const parts = actionPath.split('/');
    const name = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : actionPath;

    return { name, version };
  }

  /**
   * Extract container images from a container spec.
   * Can be a string (image name) or an object with 'image' key.
   */
  private extractContainerImages(container: unknown): Array<{ name: string; version: string }> {
    const results: Array<{ name: string; version: string }> = [];

    if (typeof container === 'string') {
      results.push(this.parseImageReference(container));
    } else if (container && typeof container === 'object') {
      const c = container as Record<string, unknown>;
      const image = c['image'];
      if (typeof image === 'string' && image) {
        results.push(this.parseImageReference(image));
      }
    }

    return results;
  }

  /**
   * Parse a Docker image reference into name and tag.
   * e.g., "node:18-alpine" → { name: "node", version: "18-alpine" }
   * e.g., "ghcr.io/owner/image:v1.0" → { name: "ghcr.io/owner/image", version: "v1.0" }
   */
  private parseImageReference(ref: string): { name: string; version: string } {
    const trimmed = ref.trim();

    // Handle digest references
    if (trimmed.includes('@sha256:')) {
      const parts = trimmed.split('@sha256:');
      return { name: parts[0], version: 'sha256:' + (parts[1] || '') };
    }

    // Split on last colon after last slash (to avoid splitting registry:port)
    const slashIdx = trimmed.lastIndexOf('/');
    const colonIdx = trimmed.lastIndexOf(':');

    if (colonIdx > slashIdx) {
      return {
        name: trimmed.substring(0, colonIdx),
        version: trimmed.substring(colonIdx + 1),
      };
    }

    return { name: trimmed, version: 'latest' };
  }
}
