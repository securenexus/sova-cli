/**
 * ScalaParser - Parse Scala SBT dependency files.
 *
 * Supported files:
 *  - *.sbt (libraryDependencies += and ++= Seq(...))
 *
 * Handles both %% (Scala version suffix) and % (Java-style) operators.
 */

import { BaseParser } from './base-parser.js';
import { readFileSafe } from '../utils/file-reader.js';
import type { ParsedResult } from '../types/parser.js';
import type { Application } from '../types/parser.js';

/**
 * Single dependency: "group" %% "artifact" % "version"
 * or:                "group" % "artifact" % "version"
 * Also captures optional trailing % "scope" or % Scope (capital identifier).
 */
const SINGLE_DEP_RE =
  /"([^"]+)"\s*%%?\s*"([^"]+)"\s*%\s*"([^"]+)"(?:\s*%\s*(?:"([^"]+)"|([A-Z][A-Za-z0-9_]*)))?/g;

export class ScalaParser extends BaseParser {
  supportedLanguages = ['scala'];

  async parse(language: string, filePath: string): Promise<ParsedResult> {
    const lower = filePath.toLowerCase();

    try {
      if (lower.endsWith('.sbt')) return this.parseSbtFile(filePath);
    } catch {
      // Fall through
    }
    return this.createEmptyResult(filePath, 'sbt');
  }

  private parseSbtFile(filePath: string): ParsedResult {
    const result = this.createEmptyResult(filePath, 'sbt', 'manifest');
    const content = readFileSafe(filePath);
    if (!content) return result;

    const apps: Application[] = [];

    // Extract project name: name := "my-project"
    const nameMatch = content.match(/name\s*:=\s*"([^"]+)"/);
    if (nameMatch) {
      result.projectName = nameMatch[1];
    }

    // Extract project version: version := "1.0.0"
    const verMatch = content.match(/version\s*:=\s*"([^"]+)"/);
    if (verMatch) {
      result.projectVersion = verMatch[1];
    }

    // Extract license
    const licenseMatch = content.match(/licenses\s*:=\s*Seq\s*\(\s*"([^"]+)"/);
    if (licenseMatch) {
      result.license = licenseMatch[1];
    }

    // Match all dependency patterns: "group" %% "artifact" % "version"
    // This works for both single += and Seq(...) patterns
    SINGLE_DEP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SINGLE_DEP_RE.exec(content)) !== null) {
      const group = match[1];
      const artifact = match[2];
      const version = match[3];
      const scopeQuoted = match[4];
      const scopeBare = match[5];

      // Combine group and artifact as the package name
      const pkgName = `${group}:${artifact}`;

      // Determine scope from optional trailing qualifier
      let scope: Application['scope'] = 'runtime';
      let rawScope: string | undefined;
      const rawQual = (scopeQuoted ?? scopeBare ?? '').trim();
      if (rawQual) {
        const lc = rawQual.toLowerCase();
        if (lc === 'test') {
          scope = 'dev';
          rawScope = 'Test';
        } else if (lc === 'it' || lc === 'integrationtest') {
          scope = 'dev';
          rawScope = 'IntegrationTest';
        }
        // Compile/Runtime/Provided/etc. → keep runtime default
      }

      apps.push(this.makeApplication(pkgName, version, scope, 'sbt', rawScope));
    }

    result.dependencies = apps;
    return result;
  }
}
