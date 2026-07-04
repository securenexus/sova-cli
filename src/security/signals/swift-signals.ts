/**
 * Swift security signal detection (Package.swift).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class SwiftSignals implements ISignalDetector {
  language = 'swift';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('Package.swift')) return [];

    const signals: SecuritySignal[] = [];

    // High: build plugins can execute arbitrary code at build time
    const pluginPattern = /\.plugin\(\s*[^)]+\)/g;
    let match: RegExpExecArray | null;
    while ((match = pluginPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'build-plugin',
        'Build plugin can execute arbitrary code during compilation',
        'high', match[0]));
    }

    // High: unsafeFlags bypass Swift Package Manager safety checks
    const unsafeFlagsPattern = /unsafeFlags\(\s*\[([^\]]*)\]/g;
    while ((match = unsafeFlagsPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'native-code', 'unsafe-flags',
        'unsafeFlags bypass SPM safety checks — can inject arbitrary compiler flags',
        'high', match[0]));
    }

    // Medium: system library targets link against C libraries
    const sysLibPattern = /\.systemLibrary\(\s*[^)]+\)/g;
    while ((match = sysLibPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'native-code', 'system-library',
        'System library dependency links against native C library',
        'medium', match[0]));
    }

    return signals;
  }
}
