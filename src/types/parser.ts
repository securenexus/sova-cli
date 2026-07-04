/**
 * Parser types - interfaces for all language parsers.
 */

/** A single parsed application/dependency entry (strict v2). */
export interface Application {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Normalized dependency scope */
  scope: 'runtime' | 'dev' | 'peer' | 'optional' | 'build';
  /** Original (raw) scope string from the source manifest, if different */
  rawScope?: string;
  /** Optional Package URL identifier (purl) */
  purl?: string;
  /** Stable composite key in "name_:_version" format */
  key: string;
}

/** Engine / runtime constraint declared by a project (e.g., node, python). */
export interface RuntimeConstraint {
  /** Engine name (e.g., "node", "python", "ruby") */
  name: string;
  /** Version constraint string (e.g., ">=18.0.0") */
  constraint: string;
}

/** Result from parsing a single dependency file */
export interface ParsedResult {
  /** Flat list of dependencies as strict Application entries */
  dependencies: Application[];
  /** Parent → children adjacency (from lock files) */
  additionalDependencies: Record<string, string[]>;
  /** Engine / runtime constraints declared in the manifest */
  engines: RuntimeConstraint[];
  /** Project name inferred from manifest */
  projectName: string;
  /** Project version inferred from manifest */
  projectVersion: string;
  /** License declared in manifest */
  license: string;
  /** Absolute path to the parsed file */
  pathToParsedFile: string;
  /** Whether this is a manifest or lock file */
  fileType: 'manifest' | 'lockfile';
  /** Package manager for this file (npm, pip, cargo, etc.) */
  packageManager: string;
}

/** Abstract interface all parsers implement */
export interface IParser {
  /** Parse a dependency file and return extracted dependencies */
  parse(language: string, filePath: string): Promise<ParsedResult>;
  /** Languages this parser supports */
  supportedLanguages: string[];
}

/** Version constraint parsed into components */
export interface VersionConstraint {
  exact?: string;
  min?: string;
  max?: string;
  minExclusive?: string;
  maxExclusive?: string;
  compatible?: string;
  approximate?: string;
}

/** Configuration options for a SOVA project scan. */
export interface ScanOptions {
  /** Absolute or relative path to the project root to scan */
  path: string;
  /** Output file path where the generated manifest JSON will be written */
  output?: string;
  /** Restrict scan to these languages; omit to auto-detect all languages */
  languages?: string[];
  /** Whether to include dev/test dependencies in the manifest */
  includeDev: boolean;
  /** Whether to include peer dependencies in the manifest */
  includePeer?: boolean;
  /** Whether to include optional dependencies in the manifest */
  includeOptional?: boolean;
  /** Emit verbose progress messages to stdout */
  verbose: boolean;
  /** Maximum directory depth to recurse when discovering files */
  maxDepth: number;
  /** Include file content snippets in security signals. Default: false */
  includeSignalContent?: boolean;
  /** Replace absolute project path with "." in manifest. Default: false */
  stripPaths?: boolean;
  /** Minimum signal severity to include (critical|high|medium|low|info). Default: include all */
  signalLevel?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Pre-loaded SOVA config (limits, signing). If omitted, defaults are used. */
  config?: import('../config/sovarc.js').SovaConfig;
  /** Bypass all scan limits */
  force?: boolean;
  /** Skip manifest signing. Default: false */
  noSign?: boolean;
}
