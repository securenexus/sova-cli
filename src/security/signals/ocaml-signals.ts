/**
 * OCaml security signal detection (opam, dune-project).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class OcamlSignals implements ISignalDetector {
  language = 'ocaml';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];
    const name = filePath.split('/').pop() ?? '';

    if (name === 'opam' || name.endsWith('.opam')) {
      // High: custom build commands can execute arbitrary code
      if (/^build:\s*\[/m.test(content)) {
        const match = content.match(/build:\s*\[[^\]]{0,200}/);
        signals.push(createSignal(filePath, this.language, 'install-script', 'opam-custom-build',
          'opam build: block runs custom commands during install',
          'high', match?.[0]));
      }

      // High: pin-depends to git/URL bypasses opam registry
      if (/pin-depends:\s*\[[\s\S]*?(git|https?:\/\/)/.test(content)) {
        const match = content.match(/pin-depends:\s*\[[\s\S]{0,200}/);
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'opam-pin-depends',
          'pin-depends references git/URL — bypasses opam registry integrity',
          'high', match?.[0]));
      }
    }

    if (name === 'dune-project' || name === 'dune') {
      // Medium: executable with foreign stubs compiles native C code
      if (/\(executable[\s\S]*?foreign_stubs/m.test(content)) {
        const match = content.match(/\(executable[\s\S]{0,200}/);
        signals.push(createSignal(filePath, this.language, 'native-code', 'dune-foreign-stubs',
          'dune executable uses foreign_stubs — compiles native C code',
          'medium', match?.[0]));
      }
    }

    return signals;
  }
}
