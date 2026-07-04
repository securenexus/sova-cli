/**
 * Security signal types for supply chain attack detection.
 */

/** Category of a detected security signal. */
export type SignalCategory =
  | 'install-script'
  | 'native-code'
  | 'dependency-confusion'
  | 'suspicious-metadata'
  | 'obfuscation'
  | 'unsafe-deserialization'
  | 'code-injection'
  | 'unsafe-archive-extraction'
  | 'unbounded-resource'
  | 'hardcoded-secret';

/** Severity level of a detected security signal. */
export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A single security finding detected in a dependency manifest or lock file. */
export interface SecuritySignal {
  /** Relative path of the file in which the signal was detected */
  file: string;
  /** Language ecosystem of the file (e.g., "javascript", "python") */
  language: string;
  /** Broad category classifying the type of supply chain risk */
  category: SignalCategory;
  /** Short machine-readable signal type identifier */
  type: string;
  /** Human-readable description of what was detected */
  description: string;
  /** Optional snippet of the file content that triggered the signal (max 500 chars) */
  content?: string;
  /** Severity rating of this finding */
  severity: SignalSeverity;
}

/** Aggregated security signals for a complete manifest scan. */
export interface ManifestSecuritySignals {
  /** Total number of signals detected */
  totalSignals: number;
  /** Count of critical-severity signals */
  critical: number;
  /** Count of high-severity signals */
  high: number;
  /** Count of medium-severity signals */
  medium: number;
  /** Count of low-severity signals */
  low: number;
  /** Full list of detected signals */
  signals: SecuritySignal[];
}

/** Interface implemented by per-language signal detectors. */
export interface ISignalDetector {
  /** Language this detector handles (e.g., "javascript") */
  language: string;
  /** Inspect a file and return any detected security signals. */
  detect(filePath: string, fileContent: string): SecuritySignal[];
}

/**
 * Construct a SecuritySignal with optional content truncated to 500 characters.
 *
 * @param file - Relative file path where the signal was found
 * @param language - Language ecosystem (e.g., "python")
 * @param category - Supply chain risk category
 * @param type - Short signal type identifier
 * @param description - Human-readable description
 * @param severity - Severity level
 * @param content - Optional triggering file content snippet
 */
export function createSignal(
  file: string,
  language: string,
  category: SignalCategory,
  type: string,
  description: string,
  severity: SignalSeverity,
  content?: string,
): SecuritySignal {
  return {
    file,
    language,
    category,
    type,
    description,
    severity,
    ...(content ? { content: content.substring(0, 500) } : {}),
  };
}

/**
 * Aggregate an array of SecuritySignals into a ManifestSecuritySignals summary.
 *
 * @param signals - Array of individual security signals
 * @returns Summary object with severity counts and the full signals list
 */
export function summarizeSignals(signals: SecuritySignal[]): ManifestSecuritySignals {
  return {
    totalSignals: signals.length,
    critical: signals.filter(s => s.severity === 'critical').length,
    high: signals.filter(s => s.severity === 'high').length,
    medium: signals.filter(s => s.severity === 'medium').length,
    low: signals.filter(s => s.severity === 'low').length,
    signals,
  };
}
