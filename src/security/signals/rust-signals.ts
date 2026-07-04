/**
 * Rust security signal detection (Cargo.toml, build.rs).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';
import { detectObfuscationInScript } from './base-signals.js';

export class RustSignals implements ISignalDetector {
  language = 'rust';

  detect(filePath: string, content: string): SecuritySignal[] {
    const base = filePath.split('/').pop() ?? '';
    if (base === 'Cargo.toml') return this.detectCargoToml(filePath, content);
    if (base === 'build.rs') return this.detectBuildRs(filePath, content);
    return [];
  }

  private detectCargoToml(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: build script declaration
    if (/^build\s*=\s*"build\.rs"/m.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'build-script',
        'Crate declares a build.rs script -- runs arbitrary code at compile time',
        'critical'));
    }

    // High: build-dependencies section
    if (/\[build-dependencies\]/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'build-dependencies',
        'Crate has build-dependencies used by build.rs during compilation',
        'high'));
    }

    // Medium: proc-macro crate
    if (/proc-macro\s*=\s*true/.test(content)) {
      signals.push(createSignal(file, this.language, 'native-code', 'proc-macro',
        'Crate is a proc-macro -- executes at compile time in the compiler process',
        'medium'));
    }

    // Medium: links key (native library linkage)
    if (/^links\s*=/m.test(content)) {
      signals.push(createSignal(file, this.language, 'native-code', 'links-key',
        'Crate links to a native system library',
        'medium'));
    }

    // High: git dependencies
    const gitDeps = content.match(/git\s*=\s*"[^"]+"/g);
    if (gitDeps) {
      for (const dep of gitDeps) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'git-dependency',
          'Dependency fetched from git -- bypasses crates.io integrity checks',
          'high', dep));
      }
    }

    // Medium: path dependencies
    const pathDeps = content.match(/path\s*=\s*"[^"]+"/g);
    if (pathDeps) {
      for (const dep of pathDeps) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'path-dependency',
          'Dependency references a local path',
          'medium', dep));
      }
    }

    return signals;
  }

  private detectBuildRs(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    signals.push(createSignal(file, this.language, 'install-script', 'build-rs-exists',
      'build.rs file exists -- executes arbitrary Rust code at compile time',
      'critical'));

    signals.push(...detectObfuscationInScript(file, this.language, content));

    return signals;
  }
}
