/**
 * PHP security signal detection (composer.json).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class PhpSignals implements ISignalDetector {
  language = 'php';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    if (filePath.endsWith('composer.json')) {
      signals.push(...this.detectComposer(filePath, content));
    }

    signals.push(...this.detectSourcePatterns(filePath, content));
    return signals;
  }

  private detectComposer(filePath: string, content: string): SecuritySignal[] {
    let composer: Record<string, unknown>;
    try {
      composer = JSON.parse(content);
    } catch {
      return [];
    }

    const signals: SecuritySignal[] = [];
    const scripts = (composer.scripts ?? {}) as Record<string, unknown>;

    // Critical: install/update lifecycle hooks
    const criticalHooks = ['post-install-cmd', 'pre-install-cmd', 'post-update-cmd'];
    for (const hook of criticalHooks) {
      if (scripts[hook]) {
        signals.push(createSignal(filePath, this.language, 'install-script', `composer-${hook}`,
          `Composer lifecycle script "${hook}" runs automatically`,
          'critical', JSON.stringify(scripts[hook]).substring(0, 200)));
      }
    }

    // High: post-autoload-dump hook
    if (scripts['post-autoload-dump']) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'composer-post-autoload-dump',
        'Composer post-autoload-dump script runs on every autoload generation',
        'high', JSON.stringify(scripts['post-autoload-dump']).substring(0, 200)));
    }

    // High: non-packagist repositories
    const repos = (composer.repositories ?? []) as Array<Record<string, unknown>> | Record<string, unknown>;
    const repoList = Array.isArray(repos) ? repos : Object.values(repos);
    for (const repo of repoList) {
      if (typeof repo === 'object' && repo !== null) {
        const r = repo as Record<string, unknown>;
        const repoType = String(r.type ?? '');
        const repoUrl = String(r.url ?? '');
        if (repoType && repoType !== 'composer' || (repoUrl && !repoUrl.includes('packagist'))) {
          signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'non-packagist-repo',
            'Non-packagist repository configured — bypasses default registry',
            'high', JSON.stringify(repo).substring(0, 200)));
        }
      }
    }

    return signals;
  }

  private detectSourcePatterns(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // unsafe-deserialization
    if (/\bunserialize\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-deserialization', 'unserialize',
        'unserialize() — arbitrary code execution risk', 'critical'));
    }

    // code-injection
    if (/\beval\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'eval-call',
        'eval() — code injection risk', 'critical'));
    }
    if (/\bexec\s*\(/.test(content) || /\bsystem\s*\(/.test(content) || /\bpassthru\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'shell-exec',
        'Shell execution function — command injection risk', 'critical'));
    }

    return signals;
  }
}
