/**
 * Julia security signal detection (Project.toml).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class JuliaSignals implements ISignalDetector {
  language = 'julia';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('Project.toml')) return [];

    const signals: SecuritySignal[] = [];

    // High: deps/build.jl reference means custom build script execution
    if (/deps\/build\.jl/.test(content) || /\bbuild\.jl\b/.test(content)) {
      const match = content.match(/.*build\.jl.*/);
      signals.push(createSignal(filePath, this.language, 'install-script', 'julia-build-script',
        'References deps/build.jl — custom build script runs during package install',
        'high', match?.[0]));
    }

    // Medium: BinaryBuilder usage downloads precompiled binaries
    if (/BinaryBuilder|BinaryProvider|JLLWrappers/.test(content)) {
      const match = content.match(/.*(BinaryBuilder|BinaryProvider|JLLWrappers).*/);
      signals.push(createSignal(filePath, this.language, 'native-code', 'julia-binary-builder',
        'Uses BinaryBuilder — downloads and links precompiled native binaries',
        'medium', match?.[0]));
    }

    return signals;
  }
}
