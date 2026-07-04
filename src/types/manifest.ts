/**
 * SOVA Manifest - The output contract between the client-side extractor
 * and the SecureNexus backend.
 *
 * The `applications` field uses "package_:_version" format, matching the
 * package identifier format expected by the SecureNexus backend.
 */

import type { ManifestSecuritySignals } from '../security/types.js';
import type { Application, RuntimeConstraint } from './parser.js';

/** Cryptographic integrity block embedded in a signed manifest. */
export interface IntegrityBlock {
  /** Base64-encoded Ed25519 signature */
  signature: string;
  /** Base64-encoded SPKI public key */
  publicKey: string;
  /** First 16 hex chars of SHA-256(publicKey) */
  keyId: string;
  /** Signing algorithm identifier */
  algorithm: 'Ed25519';
  /** ISO 8601 timestamp of when the manifest was signed */
  signedAt: string;
}

/** Top-level manifest produced by a SOVA scan. */
export interface SovaManifest {
  /** Manifest schema version (strict v2) */
  manifestSchema: '2.0';
  /** Tool / output schema version */
  version: string;
  /** ISO 8601 timestamp of when the scan completed */
  generatedAt: string;
  /** Tool metadata (name and version of the SOVA extractor) */
  tool: {
    /** NPM package name of the tool */
    name: string;
    /** Semver version of the tool */
    version: string;
  };
  /** Scanned project info */
  project: {
    /** Project name inferred from the root manifest file */
    name: string;
    /** Project version inferred from the root manifest file */
    version: string;
    /** Absolute path to the scanned project root */
    path: string;
  };
  /** High-level scan summary */
  scan: {
    /** Languages for which dependency files were found */
    languagesDetected: string[];
    /** Number of dependency files parsed */
    totalFiles: number;
    /** Total unique dependencies across all languages */
    totalDependencies: number;
    /** If true, backend can skip transitive resolution for languages with lock files */
    hasLockFiles: boolean;
  };
  /**
   * Dependencies grouped by language as strict Application entries.
   * Format: { "javascript": [{ name, version, scope, key, ... }, ...] }
   */
  applications: Record<string, Application[]>;
  /**
   * Engine / runtime constraints grouped by language.
   * Format: { "javascript": [{ name: "node", constraint: ">=18" }] }
   */
  engines: Record<string, RuntimeConstraint[]>;
  /**
   * Merged dependency graph from lock file parsing.
   * Adjacency list: parentKey -> [childKey, ...]
   */
  dependencyGraph: Record<string, string[]>;
  /** Per-file summary entries (lightweight, one per parsed file) */
  files: FileEntry[];
  /** Per-file detailed parse results including full dependency lists */
  fileResults: FileResult[];
  /** Security signals detected across all scanned manifest files */
  securitySignals: ManifestSecuritySignals;
  /** Cryptographic integrity block (present when manifest is signed) */
  integrity?: IntegrityBlock;
}

/** Lightweight summary for a single parsed dependency file. */
export interface FileEntry {
  /** Relative path within project */
  path: string;
  /** Detected language (e.g., "javascript", "python") */
  language: string;
  /** Package manager for this file (e.g., "npm", "pip") */
  packageManager: string;
  /** Whether this file is a manifest or a lock file */
  fileType: 'manifest' | 'lockfile';
  /** Number of direct dependencies found in this file */
  dependencyCount: number;
}

/** Detailed parse result for a single dependency file. */
export interface FileResult {
  /** Relative path within project */
  file: string;
  /** Detected language (e.g., "javascript", "python") */
  language: string;
  /** Package manager for this file (e.g., "npm", "pip") */
  packageManager: string;
  /** Whether this file is a manifest or a lock file */
  fileType: 'manifest' | 'lockfile';
  /** Dependencies as strict Application entries */
  dependencies: Application[];
  /** Parent -> children adjacency list from lock file parsing */
  additionalDependencies: Record<string, string[]>;
}
