/**
 * Perl security signal detection (Makefile.PL).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class PerlSignals implements ISignalDetector {
  language = 'perl';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('Makefile.PL')) return [];

    const signals: SecuritySignal[] = [];

    // High: custom commands in WriteMakefile (arbitrary code execution during build)
    if (/WriteMakefile\s*\([\s\S]*?(MY::|sub\s+\w+|postamble)/m.test(content)) {
      const match = content.match(/WriteMakefile\s*\([\s\S]{0,200}/);
      signals.push(createSignal(filePath, this.language, 'install-script', 'custom-makefile-command',
        'WriteMakefile contains custom commands — runs arbitrary code during build',
        'high', match?.[0]));
    }

    // Medium: .xs file references indicate native XS/C code compilation
    if (/\.xs\b/.test(content)) {
      const match = content.match(/.*\.xs.*/);
      signals.push(createSignal(filePath, this.language, 'native-code', 'xs-native-code',
        'References .xs files — native C/XS code compiled during install',
        'medium', match?.[0]));
    }

    return signals;
  }
}
