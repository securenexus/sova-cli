/**
 * CocoaPods security signal detection (.podspec, Podfile).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class CocoapodsSignals implements ISignalDetector {
  language = 'cocoa';

  detect(filePath: string, content: string): SecuritySignal[] {
    const name = filePath.split('/').pop() ?? '';
    if (name.endsWith('.podspec') || name.endsWith('.podspec.json')) {
      return this.detectPodspec(filePath, content);
    }
    if (name === 'Podfile' || name === 'Podfile.lock') {
      return this.detectPodfile(filePath, content);
    }
    return [];
  }

  private detectPodspec(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: script_phases inject arbitrary shell execution during build
    const scriptPhase = content.match(/script_phases\s*=.*$/m);
    if (scriptPhase || /\.script_phase\s*=/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'podspec-script-phase',
        'Podspec defines script_phases — runs arbitrary shell commands during build',
        'critical', scriptPhase?.[0]));
    }

    // Critical: prepare_command runs during pod install
    const prepCmd = content.match(/\.prepare_command\s*=\s*['"<].*$/m);
    if (prepCmd) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'podspec-prepare-command',
        'Podspec prepare_command executes shell commands on pod install',
        'critical', prepCmd[0]));
    }

    return signals;
  }

  private detectPodfile(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // High: git-sourced pods bypass CocoaPods trunk integrity
    const gitPods = [...content.matchAll(/:git\s*=>\s*['"]([^'"]+)['"]/g)];
    for (const m of gitPods) {
      signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'git-pod-source',
        'Pod sourced directly from git — bypasses CocoaPods trunk registry',
        'high', m[1]));
    }

    return signals;
  }
}
