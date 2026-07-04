/**
 * Haxe security signal detection (haxelib.json).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class HaxeSignals implements ISignalDetector {
  language = 'haxe';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('haxelib.json')) return [];

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(content);
    } catch {
      return [];
    }

    const signals: SecuritySignal[] = [];

    // High: postInstall script runs automatically after haxelib install
    if (pkg.postInstall) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'haxelib-post-install',
        'haxelib.json has postInstall — runs automatically after install',
        'high', String(pkg.postInstall)));
    }

    // Medium: git dependency URLs bypass haxelib registry
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    for (const [name, version] of Object.entries(deps)) {
      if (/git(\+https?|@|:\/\/)|^https?:\/\//.test(version)) {
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'haxelib-git-dep',
          `Dependency "${name}" uses git/URL — bypasses haxelib registry`,
          'medium', `${name}: ${version}`));
      }
    }

    return signals;
  }
}
