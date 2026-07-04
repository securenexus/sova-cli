/**
 * SOVA - SecureNexus Supply Chain Orchestration & Visualization Assistant
 *
 * @packageDocumentation
 */

import { resolve, relative, basename } from 'node:path';
import { SOVA_VERSION } from './utils/version.js';
import { discoverFiles } from './scanner/file-discovery.js';
import { getParser } from './parsers/parser-registry.js';
import { isLockFile, detectPackageManager } from './config/package-manager-mappings.js';
import { SecuritySignalDetector } from './security/signal-detector.js';
import { summarizeSignals } from './security/types.js';
import type { SovaManifest, FileEntry, FileResult } from './types/manifest.js';
import type { ScanOptions, ParsedResult, Application, RuntimeConstraint } from './types/parser.js';
import { preScan } from './scanner/pre-scan.js';
import { DEFAULT_CONFIG, type SovaConfig } from './config/sovarc.js';
import { formatSize } from './utils/parse-size.js';

// Re-export types for library consumers
export type { SovaManifest, FileEntry, FileResult } from './types/manifest.js';
export type { ScanOptions } from './types/parser.js';
export type {
  SecuritySignal,
  ManifestSecuritySignals,
  SignalCategory,
  SignalSeverity,
  ISignalDetector,
} from './security/types.js';
export { createSignal, summarizeSignals } from './security/types.js';
export type { IParser, VersionConstraint } from './types/parser.js';
export { BaseParser } from './parsers/base-parser.js';
export { SOVA_VERSION } from './utils/version.js';
export type { SovaConfig } from './config/sovarc.js';
export { loadConfig, DEFAULT_CONFIG } from './config/sovarc.js';
export type { IntegrityBlock } from './types/manifest.js';
export type { VerificationResult } from './crypto/verifier.js';
export { verifyManifest } from './crypto/verifier.js';

/**
 * Scan a project directory and generate a SovaManifest.
 *
 * Discovers dependency files, parses them with language-specific parsers,
 * detects security signals, and produces a structured manifest.
 *
 * @param options - Scan configuration (path, languages, depth, etc.)
 * @returns A SovaManifest containing all discovered dependencies and signals
 *
 * @example
 * ```typescript
 * import { scanProject } from '@securenexus/sova';
 *
 * const manifest = await scanProject({
 *   path: '/path/to/project',
 *   output: 'sova-manifest.json',
 *   includeDev: true,
 *   verbose: false,
 *   maxDepth: 10,
 * });
 *
 * console.log(`Found ${manifest.scan.totalDependencies} dependencies`);
 * ```
 */
export async function scanProject(options: ScanOptions): Promise<SovaManifest> {
  const rootDir = resolve(options.path);

  // Load config (passed in or defaults)
  const config: SovaConfig = options.config ?? DEFAULT_CONFIG;

  // Pre-scan: enforce limits (unless --force)
  let skipPaths: Set<string> | undefined;
  if (!options.force) {
    if (options.verbose) console.log('  Running pre-scan estimation...');
    const preScanResult = preScan(rootDir, config.limits);

    if (preScanResult.skippedFiles.length > 0) {
      skipPaths = new Set(preScanResult.skippedFiles.map(f => f.path));
      for (const skipped of preScanResult.skippedFiles) {
        if (options.verbose) console.log(`  Skipping ${skipped.path}: ${skipped.reason}`);
      }
    }

    if (options.verbose) {
      console.log(`  Pre-scan: ${preScanResult.fileCount} files, ${formatSize(preScanResult.totalSize)} total`);
    }
  }

  // Step 1: Discover dependency files
  if (options.verbose) console.log('  Discovering dependency files...');

  const discovery = discoverFiles(
    rootDir,
    options.maxDepth,
    options.languages,
    options.verbose,
    skipPaths,
  );

  if (options.verbose) {
    console.log(`  Found ${discovery.totalFiles} files across ${discovery.languagesDetected.length} languages`);
  }

  // Step 2: Parse each file
  const allApplications: Record<string, Map<string, Application>> = {};
  const allEngines: Record<string, Map<string, RuntimeConstraint>> = {};
  const allGraph: Record<string, string[]> = {};
  const files: FileEntry[] = [];
  const fileResults: FileResult[] = [];
  let hasLockFiles = false;
  let projectName = '';
  let projectVersion = '';

  for (const [language, filePaths] of Object.entries(discovery.files)) {
    const parser = await getParser(language);
    if (!parser) {
      if (options.verbose) {
        console.log(`  Skipping ${language} (no parser available)`);
      }
      continue;
    }

    for (const filePath of filePaths) {
      const fileName = basename(filePath);
      const relPath = relative(rootDir, filePath);

      if (options.verbose) {
        console.log(`  Parsing [${language}] ${relPath}`);
      }

      let result: ParsedResult;
      try {
        result = await parser.parse(language, filePath);
      } catch (err) {
        if (options.verbose) {
          console.log(`  Warning: Failed to parse ${relPath}: ${err instanceof Error ? err.message : err}`);
        }
        continue;
      }

      if (result.dependencies.length === 0 && Object.keys(result.additionalDependencies).length === 0) {
        continue; // Skip empty results
      }

      // Track lock files
      const fileType = isLockFile(fileName) ? 'lockfile' as const : (result.fileType || 'manifest' as const);
      if (fileType === 'lockfile') hasLockFiles = true;

      // Infer project info from first manifest
      if (!projectName && result.projectName) projectName = result.projectName;
      if (!projectVersion && result.projectVersion) projectVersion = result.projectVersion;

      const packageManager = result.packageManager || detectPackageManager(fileName, language);

      // Apply scope filter post-parse
      let appsForFile = result.dependencies;
      if (options.includeDev === false) appsForFile = appsForFile.filter(a => a.scope !== 'dev');
      if (options.includePeer === false) appsForFile = appsForFile.filter(a => a.scope !== 'peer');
      if (options.includeOptional === false) appsForFile = appsForFile.filter(a => a.scope !== 'optional');

      // Aggregate applications per language, deduped by purl-or-key
      if (!allApplications[language]) allApplications[language] = new Map();
      for (const app of appsForFile) {
        const dedupKey = app.purl || app.key;
        if (!allApplications[language].has(dedupKey)) allApplications[language].set(dedupKey, app);
      }

      // Aggregate engines per language, deduped by name
      if (result.engines && result.engines.length > 0) {
        if (!allEngines[language]) allEngines[language] = new Map();
        for (const e of result.engines) {
          if (!allEngines[language].has(e.name)) allEngines[language].set(e.name, e);
        }
      }

      // Merge dependency graph
      for (const [parent, children] of Object.entries(result.additionalDependencies)) {
        if (!allGraph[parent]) {
          allGraph[parent] = [...children];
        } else {
          // Merge unique children
          const existing = new Set(allGraph[parent]);
          for (const child of children) {
            if (!existing.has(child)) {
              allGraph[parent].push(child);
            }
          }
        }
      }

      // Record file entry
      files.push({
        path: relPath,
        language,
        packageManager,
        fileType,
        dependencyCount: appsForFile.length,
      });

      fileResults.push({
        file: relPath,
        language,
        packageManager,
        fileType,
        dependencies: appsForFile,
        additionalDependencies: result.additionalDependencies,
      });
    }
  }

  // Step 3: Detect security signals
  if (options.verbose) console.log('  Scanning for security signals...');

  const signalDetector = new SecuritySignalDetector();
  const signalFiles = files.map(f => ({
    path: resolve(rootDir, f.path),
    language: f.language,
  }));
  const securitySignals = await signalDetector.detect(signalFiles, rootDir, options.verbose);

  if (options.verbose) {
    console.log(`  Found ${securitySignals.totalSignals} security signals (${securitySignals.critical} critical, ${securitySignals.high} high)`);
  }

  // Filter signals by minimum severity level if requested
  const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  if (options.signalLevel) {
    const minLevel = SEVERITY_ORDER[options.signalLevel] ?? 3;
    securitySignals.signals = securitySignals.signals.filter(
      s => (SEVERITY_ORDER[s.severity] ?? 4) <= minLevel
    );
    Object.assign(securitySignals, { ...summarizeSignals(securitySignals.signals) });
  }

  // Convert Maps to arrays for JSON output
  const applications: Record<string, Application[]> = {};
  const engines: Record<string, RuntimeConstraint[]> = {};
  let totalDependencies = 0;
  for (const [lang, appsMap] of Object.entries(allApplications)) {
    applications[lang] = Array.from(appsMap.values());
    totalDependencies += applications[lang].length;
  }
  for (const [lang, engMap] of Object.entries(allEngines)) {
    engines[lang] = Array.from(engMap.values());
  }

  // Build manifest
  const manifest: SovaManifest = {
    manifestSchema: '2.0',
    version: SOVA_VERSION,
    generatedAt: new Date().toISOString(),
    tool: {
      name: '@securenexus/sova',
      version: SOVA_VERSION,
    },
    project: {
      name: projectName || basename(rootDir),
      version: projectVersion || '',
      path: rootDir,
    },
    scan: {
      languagesDetected: discovery.languagesDetected,
      totalFiles: files.length,
      totalDependencies,
      hasLockFiles,
    },
    applications,
    engines,
    dependencyGraph: allGraph,
    files,
    fileResults,
    securitySignals,
  };

  // Strip signal content unless explicitly requested (avoids leaking file contents)
  if (!options.includeSignalContent) {
    for (const signal of securitySignals.signals) {
      delete signal.content;
    }
  }

  // Strip absolute project path if requested (for privacy / reproducible output)
  if (options.stripPaths) {
    manifest.project.path = '.';
  }

  // Sign manifest (unless autoSign is disabled or --no-sign)
  if (config.signing.autoSign && !options.noSign) {
    const { ensureKeypair } = await import('./crypto/key-manager.js');
    const { signManifest } = await import('./crypto/signer.js');

    const keypair = ensureKeypair(config.signing.keyPath);
    if (options.verbose) {
      console.log(`  Signing manifest (keyId: ${keypair.keyId})...`);
    }
    return signManifest(manifest, keypair);
  }

  return manifest;
}
