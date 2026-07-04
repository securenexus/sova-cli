/**
 * Ruby security signal detection (.gemspec, Gemfile).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';
import { detectObfuscationInScript } from './base-signals.js';

export class RubySignals implements ISignalDetector {
  language = 'ruby';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    if (filePath.endsWith('.gemspec')) signals.push(...this.detectGemspec(filePath, content));
    else if (filePath.endsWith('Gemfile')) signals.push(...this.detectGemfile(filePath, content));

    signals.push(...this.detectSourcePatterns(filePath, content));
    return signals;
  }

  private detectGemspec(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: native extensions
    if (/spec\.extensions\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'native-code', 'gem-extensions',
        'Gemspec declares native extensions -- runs compiled code during install',
        'critical'));
    }

    // Critical: eval/system in gemspec
    if (/\beval\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'obfuscation', 'gemspec-eval',
        'Gemspec uses eval() -- can execute arbitrary code at build time',
        'critical'));
    }
    if (/\bsystem\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'obfuscation', 'gemspec-system',
        'Gemspec uses system() -- executes shell commands at build time',
        'critical'));
    }

    // Medium: post-install message (social engineering vector)
    if (/post_install_message/.test(content)) {
      signals.push(createSignal(file, this.language, 'suspicious-metadata', 'post-install-message',
        'Gem sets post_install_message -- can be used for social engineering',
        'medium'));
    }

    // Medium: declares executables
    if (/spec\.executables\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'gem-executables',
        'Gem declares executables that are added to PATH',
        'medium'));
    }

    // General obfuscation checks
    signals.push(...detectObfuscationInScript(file, this.language, content));

    return signals;
  }

  private detectGemfile(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // High: git source dependencies
    const gitMatches = content.match(/,\s*git:\s*['"][^'"]+['"]/g);
    if (gitMatches) {
      for (const match of gitMatches) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'gemfile-git-source',
          'Gemfile installs gem from git -- bypasses RubyGems integrity checks',
          'high', match));
      }
    }

    // Medium: path source dependencies
    const pathMatches = content.match(/,\s*path:\s*['"][^'"]+['"]/g);
    if (pathMatches) {
      for (const match of pathMatches) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'gemfile-path-source',
          'Gemfile references local path dependency',
          'medium', match));
      }
    }

    return signals;
  }

  private detectSourcePatterns(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // unsafe-deserialization
    if (/\bYAML\.load\b/.test(content) && !/\bYAML\.safe_load\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-deserialization', 'yaml-unsafe-load',
        'YAML.load without safe_load — code execution risk', 'critical'));
    }
    if (/\bMarshal\.load\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-deserialization', 'marshal-load',
        'Marshal.load — unsafe deserialization', 'critical'));
    }

    // code-injection
    if (/\beval\s*[\s(]/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'eval-call',
        'eval() usage — code injection risk', 'critical'));
    }
    if (/\bsystem\s*[\s(]/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'system-call',
        'system() — command injection risk', 'high'));
    }

    return signals;
  }
}
