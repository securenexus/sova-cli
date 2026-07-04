/**
 * R security signal detection (DESCRIPTION, configure scripts).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class RSignals implements ISignalDetector {
  language = 'r';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];
    const name = filePath.split('/').pop() ?? '';

    if (name === 'DESCRIPTION') {
      // Medium: SystemRequirements means external system dependencies
      if (/^SystemRequirements:/m.test(content)) {
        const match = content.match(/SystemRequirements:.*/);
        signals.push(createSignal(filePath, this.language, 'native-code', 'r-system-requirements',
          'Package declares SystemRequirements — needs external system libraries',
          'medium', match?.[0]));
      }

      // Medium: NeedsCompilation means native code compilation
      if (/^NeedsCompilation:\s*yes/mi.test(content)) {
        signals.push(createSignal(filePath, this.language, 'native-code', 'r-needs-compilation',
          'Package requires native code compilation during install',
          'medium', 'NeedsCompilation: yes'));
      }

      // High: Remotes field installs from non-CRAN sources
      if (/^Remotes:/m.test(content)) {
        const match = content.match(/Remotes:[\s\S]*?(?=\n\S|$)/);
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'r-remotes',
          'Remotes field installs packages from non-CRAN sources (GitHub/URLs)',
          'high', match?.[0]));
      }

      // High: configure script references — arbitrary shell execution
      if (/\bconfigure(\.win)?\b/.test(content)) {
        const match = content.match(/.*configure.*/);
        signals.push(createSignal(filePath, this.language, 'install-script', 'r-configure-script',
          'References configure/configure.win — runs shell scripts during install',
          'high', match?.[0]));
      }
    }

    return signals;
  }
}
