/**
 * TerraformParser - Parse Terraform dependency files.
 *
 * Supported files:
 *  - *.tf (required_providers blocks with source and version)
 *  - .terraform.lock.hcl (provider blocks with version and constraints)
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { ParsedResult } from '../types/parser.js';
import type { Application } from '../types/parser.js';

/**
 * Match provider blocks inside required_providers:
 *   name = {
 *     source  = "registry/namespace/name"
 *     version = "~> 1.0"
 *   }
 */
const REQUIRED_PROVIDER_RE = /(\w+)\s*=\s*\{[^}]*?source\s*=\s*"([^"]+)"[^}]*?version\s*=\s*"([^"]+)"[^}]*?\}/gs;

/**
 * Match provider blocks in .terraform.lock.hcl:
 *   provider "registry.terraform.io/hashicorp/aws" {
 *     version     = "5.0.0"
 *     constraints = "~> 5.0"
 *   }
 */
const LOCK_PROVIDER_RE = /provider\s+"([^"]+)"\s*\{([^}]*)\}/gs;

/** Extract version = "..." from a block body */
const VERSION_IN_BLOCK_RE = /version\s*=\s*"([^"]+)"/;

/** Extract constraints = "..." from a block body */
const CONSTRAINTS_IN_BLOCK_RE = /constraints\s*=\s*"([^"]+)"/;

/**
 * Match module source with version:
 *   source  = "registry.terraform.io/namespace/name/provider"
 *   version = "1.0.0"
 */
const MODULE_RE = /module\s+"[^"]*"\s*\{([^}]*)\}/gs;
const MODULE_SOURCE_RE = /source\s*=\s*"([^"]+)"/;
const MODULE_VERSION_RE = /version\s*=\s*"([^"]+)"/;

export class TerraformParser extends BaseParser {
  supportedLanguages = ['terraform'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('.terraform.lock.hcl')) return this.parseLockHcl(filePath);
      if (lower.endsWith('.tf')) return this.parseTfFile(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'terraform');
  }

  // ── *.tf ─────────────────────────────────────────────────────

  private parseTfFile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'terraform', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];
    const seen = new Set<string>();

    // Extract required_providers
    REQUIRED_PROVIDER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REQUIRED_PROVIDER_RE.exec(content)) !== null) {
      const source = match[2];
      const versionConstraint = match[3];
      const version = this.extractTerraformVersion(versionConstraint);

      const key = source.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        apps.push(this.makeApplication(source, version, 'runtime', 'terraform'));
      }
    }

    // Also try a more lenient approach for providers that might not match the strict regex
    // Look for required_providers block and parse it manually
    if (apps.length === 0) {
      apps.push(...this.parseRequiredProvidersManual(content, seen));
    }

    // Extract module sources with versions
    MODULE_RE.lastIndex = 0;
    while ((match = MODULE_RE.exec(content)) !== null) {
      const body = match[1];
      const sourceMatch = MODULE_SOURCE_RE.exec(body);
      const versionMatch = MODULE_VERSION_RE.exec(body);

      if (sourceMatch) {
        const source = sourceMatch[1];
        const version = versionMatch ? this.extractTerraformVersion(versionMatch[1]) : '';

        // Skip local paths and git URLs
        if (source.startsWith('.') || source.startsWith('/') || source.includes('git::')) continue;

        const key = source.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(source, version, 'runtime', 'terraform'));
        }
      }
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Manual parsing of required_providers for cases where the regex doesn't match.
   * Handles multi-line blocks and various formatting styles.
   */
  private parseRequiredProvidersManual(content: string, seen: Set<string>): Application[] {
    const apps: Application[] = [];

    // Find required_providers block
    const rpStart = content.indexOf('required_providers');
    if (rpStart === -1) return apps;

    // Find the opening brace after required_providers
    const braceStart = content.indexOf('{', rpStart);
    if (braceStart === -1) return apps;

    // Find matching closing brace
    let depth = 0;
    let rpEnd = -1;
    for (let i = braceStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          rpEnd = i;
          break;
        }
      }
    }

    if (rpEnd === -1) return apps;

    const rpBlock = content.substring(braceStart + 1, rpEnd);

    // Match individual provider entries
    const providerRE = /(\w+)\s*=\s*\{([^}]*)\}/gs;
    let match: RegExpExecArray | null;
    while ((match = providerRE.exec(rpBlock)) !== null) {
      const body = match[2];

      const sourceMatch = body.match(/source\s*=\s*"([^"]+)"/);
      const versionMatch = body.match(/version\s*=\s*"([^"]+)"/);

      if (sourceMatch) {
        const source = sourceMatch[1];
        const version = versionMatch ? this.extractTerraformVersion(versionMatch[1]) : '';

        const key = source.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          apps.push(this.makeApplication(source, version, 'runtime', 'terraform'));
        }
      }
    }

    return apps;
  }

  // ── .terraform.lock.hcl ──────────────────────────────────────

  private parseLockHcl(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'terraform', 'lockfile');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    LOCK_PROVIDER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LOCK_PROVIDER_RE.exec(content)) !== null) {
      const providerPath = match[1];
      const body = match[2];

      const versionMatch = VERSION_IN_BLOCK_RE.exec(body);
      const version = versionMatch ? versionMatch[1] : '';

      apps.push(this.makeApplication(providerPath, version, 'runtime', 'terraform'));
    }

    result.dependencies = apps;
    return result;
  }

  /**
   * Extract version from Terraform version constraint.
   * e.g., "~> 5.0" -> "5.0", ">= 1.0, < 2.0" -> "1.0"
   */
  private extractTerraformVersion(constraint: string): string {
    if (!constraint) return '';
    const cleaned = constraint.replace(/[~><=!]+\s*/g, '').trim();
    const match = cleaned.match(/([\d]+(?:\.[\d]+)*)/);
    return match ? match[1] : '';
  }
}
