/**
 * Erlang security signal detection (rebar.config).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class ErlangSignals implements ISignalDetector {
  language = 'erlang';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('rebar.config')) return [];

    const signals: SecuritySignal[] = [];
    let match: RegExpExecArray | null;

    // Critical: pre_hooks run shell commands before compilation
    const preHookPattern = /\{pre_hooks\s*,\s*\[([^\]]*)\]\}/g;
    while ((match = preHookPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'pre-hooks',
        'pre_hooks execute shell commands before compilation — critical supply chain risk',
        'critical', match[0]));
    }

    // Critical: post_hooks run shell commands after compilation
    const postHookPattern = /\{post_hooks\s*,\s*\[([^\]]*)\]\}/g;
    while ((match = postHookPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'post-hooks',
        'post_hooks execute shell commands after compilation — critical supply chain risk',
        'critical', match[0]));
    }

    // High: provider_hooks inject custom build providers
    const providerPattern = /\{provider_hooks\s*,\s*\[([^\]]*)\]\}/g;
    while ((match = providerPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'provider-hooks',
        'provider_hooks inject custom build providers that run during compilation',
        'high', match[0]));
    }

    // Medium: port_specs compile native C/C++ code
    const portPattern = /\{port_specs\s*,\s*\[/g;
    while ((match = portPattern.exec(content)) !== null) {
      const context = content.substring(match.index, Math.min(content.length, match.index + 200));
      signals.push(createSignal(filePath, this.language, 'native-code', 'port-specs',
        'port_specs compile native C/C++ code — may contain unsafe operations',
        'medium', context.trim()));
    }

    return signals;
  }
}
