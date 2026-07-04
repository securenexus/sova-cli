/**
 * JavaScript/Node.js security signal detection (package.json).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';
import {
  detectObfuscationInScript,
  detectMissingMetadata,
  detectWildcardVersion,
  detectGitUrlDependency,
  detectUrlDependency,
} from './base-signals.js';

export class JavaScriptSignals implements ISignalDetector {
  language = 'javascript';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    if (filePath.endsWith('package.json')) {
      signals.push(...this.detectPackageJson(filePath, content));
    }

    signals.push(...this.detectSourcePatterns(filePath, content));
    return signals;
  }

  private detectPackageJson(filePath: string, content: string): SecuritySignal[] {
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(content);
    } catch {
      return [];
    }

    const signals: SecuritySignal[] = [];
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;

    // Critical: lifecycle install hooks
    for (const hook of ['preinstall', 'postinstall', 'install']) {
      if (scripts[hook]) {
        signals.push(createSignal(filePath, this.language, 'install-script', `${hook}-script`,
          `Lifecycle script "${hook}" runs automatically on install`,
          'critical', scripts[hook]));
        signals.push(...detectObfuscationInScript(filePath, this.language, scripts[hook]));
      }
    }

    // High: prepare script (runs on install from git)
    if (scripts.prepare) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'prepare-script',
        'Prepare script runs on install from git sources',
        'high', scripts.prepare));
    }

    // High: native addon / node-gyp references
    if (content.includes('node-gyp') || content.includes('prebuild') || content.includes('napi')) {
      signals.push(createSignal(filePath, this.language, 'native-code', 'native-addon',
        'Package includes native addon compilation (node-gyp/napi)',
        'high'));
    }

    // Scan all dependency sections
    const depSections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    for (const section of depSections) {
      const deps = (pkg[section] ?? {}) as Record<string, string>;
      for (const [name, version] of Object.entries(deps)) {
        const gitSig = detectGitUrlDependency(filePath, this.language, version);
        if (gitSig) signals.push(gitSig);

        const urlSig = detectUrlDependency(filePath, this.language, version);
        if (urlSig) signals.push(urlSig);

        const wildcardSig = detectWildcardVersion(filePath, this.language, name, version);
        if (wildcardSig) signals.push(wildcardSig);
      }
    }

    // Low: missing metadata
    signals.push(...detectMissingMetadata(filePath, this.language, pkg));

    return signals;
  }

  private detectSourcePatterns(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Code injection
    if (/\beval\s*\(/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'code-injection', 'eval-call',
        'Potential code injection: eval() usage detected', 'critical'));
    }
    if (/\bnew\s+Function\s*\(/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'code-injection', 'function-constructor',
        'Potential code injection: Function constructor detected', 'critical'));
    }

    // Unsafe deserialization
    if (/new\s+XMLParser\s*\(\s*\)/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'unsafe-deserialization', 'xml-default-config',
        'XMLParser instantiated with default options — may be vulnerable to XXE', 'high'));
    }

    // Unsafe archive extraction
    if (/\.extractAllTo\s*\(/.test(content) || /\.extractEntryTo\s*\(/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'unsafe-archive-extraction', 'zip-extract',
        'Archive extraction detected — verify path validation to prevent zip-slip', 'high'));
    }

    return signals;
  }
}
