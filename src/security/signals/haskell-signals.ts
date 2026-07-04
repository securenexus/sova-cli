/**
 * Haskell security signal detection (.cabal files).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class HaskellSignals implements ISignalDetector {
  language = 'haskell';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('.cabal')) return [];

    const signals: SecuritySignal[] = [];
    const lower = content.toLowerCase();

    // High: custom-setup runs arbitrary Haskell code at configure time
    if (/^custom-setup\b/im.test(content)) {
      const setupBlock = content.match(/custom-setup[\s\S]*?(?=\n\S|\n$)/i);
      signals.push(createSignal(filePath, this.language, 'install-script', 'custom-setup',
        'custom-setup section runs arbitrary Haskell code during package configuration',
        'high', setupBlock?.[0]?.trim()));
    }

    // Medium: build-tools may invoke external executables during build
    const buildToolsPattern = /^[\t ]*build-tools?\s*:\s*(.+)/gim;
    let match: RegExpExecArray | null;
    while ((match = buildToolsPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'build-tools',
        'build-tools invoke external executables during compilation',
        'medium', match[0].trim()));
    }

    // Medium: c-sources compile native C code bundled with the package
    const cSourcesPattern = /^[\t ]*c-sources\s*:\s*(.+)/gim;
    while ((match = cSourcesPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'native-code', 'c-sources',
        'Package bundles and compiles native C source files',
        'medium', match[0].trim()));
    }

    // Medium: extra-libraries link against system shared libraries
    const extraLibPattern = /^[\t ]*extra-libraries\s*:\s*(.+)/gim;
    while ((match = extraLibPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'native-code', 'extra-libraries',
        'Package links against external system libraries',
        'medium', match[0].trim()));
    }

    return signals;
  }
}
