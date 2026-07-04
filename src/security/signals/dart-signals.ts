/**
 * Dart/Flutter security signal detection (pubspec.yaml).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class DartSignals implements ISignalDetector {
  language = 'dart';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('pubspec.yaml')) return [];

    const signals: SecuritySignal[] = [];
    const lines = content.split('\n');

    // Medium: executables section — package provides CLI binaries
    if (/^executables\s*:/m.test(content)) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'executables',
        'Package declares executables — installed binaries run with user privileges',
        'medium', lines.find(l => /^executables\s*:/.test(l))?.trim()));
    }

    // High: git dependencies bypass pub.dev integrity checks
    const gitDepPattern = /^\s+git\s*:/gm;
    let match: RegExpExecArray | null;
    while ((match = gitDepPattern.exec(content)) !== null) {
      const context = content.substring(Math.max(0, match.index - 60), match.index + match[0].length + 60);
      signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'git-dependency',
        'Dependency sourced from git — bypasses pub.dev registry integrity',
        'high', context.trim()));
    }

    // Medium: path dependencies can reference arbitrary local code
    const pathDepPattern = /^\s+path\s*:/gm;
    while ((match = pathDepPattern.exec(content)) !== null) {
      const context = content.substring(Math.max(0, match.index - 60), match.index + match[0].length + 60);
      signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'path-dependency',
        'Dependency sourced from local path — not reproducible across environments',
        'medium', context.trim()));
    }

    return signals;
  }
}
