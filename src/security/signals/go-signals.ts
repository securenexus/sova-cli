/**
 * Go security signal detection (go.mod, .go files).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';
import { detectObfuscationInScript } from './base-signals.js';

export class GoSignals implements ISignalDetector {
  language = 'go';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    if (filePath.endsWith('go.mod')) signals.push(...this.detectGoMod(filePath, content));
    else if (filePath.endsWith('.go')) signals.push(...this.detectGoFile(filePath, content));

    signals.push(...this.detectSourcePatterns(filePath, content));
    return signals;
  }

  private detectGoMod(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];
    const lines = content.split('\n');
    let inReplaceBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track replace block
      if (/^replace\s*\(/.test(trimmed)) { inReplaceBlock = true; continue; }
      if (inReplaceBlock && trimmed === ')') { inReplaceBlock = false; continue; }

      // Single-line or block replace directives
      const isReplace = inReplaceBlock || /^replace\s+/.test(trimmed);
      if (isReplace && trimmed !== '' && trimmed !== ')') {
        const parts = trimmed.replace(/^replace\s+/, '').split('=>').map(s => s.trim());
        if (parts.length === 2) {
          const original = parts[0].split(/\s+/)[0] ?? '';
          const replacement = parts[1].split(/\s+/)[0] ?? '';
          // Critical if replacing with a different module path
          if (original && replacement && !replacement.startsWith('./') && !replacement.startsWith('../') && original !== replacement) {
            signals.push(createSignal(file, this.language, 'dependency-confusion', 'replace-different-repo',
              `Module replaced with different repo: ${original} => ${replacement}`,
              'critical', trimmed));
          } else {
            signals.push(createSignal(file, this.language, 'dependency-confusion', 'replace-directive',
              'go.mod uses replace directive -- overrides module resolution',
              'high', trimmed));
          }
        }
      }

      // Medium: retract directive
      if (/^retract\b/.test(trimmed)) {
        signals.push(createSignal(file, this.language, 'suspicious-metadata', 'retract-directive',
          'go.mod retracts versions -- may indicate compromised releases',
          'medium', trimmed));
      }
    }

    return signals;
  }

  private detectGoFile(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // High: CGO usage
    if (/import\s+"C"/.test(content) || /import\s+\(\s*"C"/.test(content)) {
      signals.push(createSignal(file, this.language, 'native-code', 'cgo-import',
        'File uses CGO (import "C") -- executes C code, bypasses Go safety',
        'high'));
    }

    // High: go:generate directives
    const generateMatches = content.match(/\/\/go:generate\s+.+/g);
    if (generateMatches) {
      for (const match of generateMatches) {
        signals.push(createSignal(file, this.language, 'install-script', 'go-generate',
          'File contains //go:generate directive -- runs arbitrary commands',
          'high', match));
      }
    }

    // General obfuscation in go files that use CGO
    if (/import\s+"C"/.test(content)) {
      signals.push(...detectObfuscationInScript(file, this.language, content));
    }

    return signals;
  }

  private detectSourcePatterns(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // code-injection
    if (/exec\.Command\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'exec-command',
        'exec.Command() — verify input sanitization', 'high'));
    }

    // unbounded-resource
    if (/io\.ReadAll\s*\(/.test(content) || /ioutil\.ReadAll\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'unbounded-resource', 'readall-unbounded',
        'ReadAll without LimitReader — unbounded memory risk', 'medium'));
    }

    return signals;
  }
}
