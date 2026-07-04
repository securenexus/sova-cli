/**
 * Elixir security signal detection (mix.exs).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class ElixirSignals implements ISignalDetector {
  language = 'elixir';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('mix.exs')) return [];

    const signals: SecuritySignal[] = [];

    // High: custom compilers can execute arbitrary code at build time
    const compilerPattern = /compilers\s*:\s*\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = compilerPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'custom-compilers',
        'Custom compilers execute arbitrary code during build',
        'high', match[0]));
    }

    // High: aliases with shell commands run arbitrary system commands
    const aliasPattern = /aliases[\s\S]*?(?:System\.cmd|:os\.cmd|~s|"[^"]*sh |'[^']*sh )/g;
    while ((match = aliasPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'alias-shell-command',
        'Mix alias executes shell commands — may run arbitrary code',
        'high', match[0]));
    }

    // High: git dependencies bypass Hex registry integrity checks
    const gitDepPattern = /\{:\w+,\s*git\s*:/g;
    while ((match = gitDepPattern.exec(content)) !== null) {
      const context = content.substring(match.index, Math.min(content.length, match.index + 120));
      signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'git-dependency',
        'Dependency sourced from git — bypasses Hex registry integrity',
        'high', context.trim()));
    }

    return signals;
  }
}
