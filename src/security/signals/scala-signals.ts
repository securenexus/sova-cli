/**
 * Scala security signal detection (build.sbt).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class ScalaSignals implements ISignalDetector {
  language = 'scala';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('build.sbt')) return [];

    const signals: SecuritySignal[] = [];
    let match: RegExpExecArray | null;

    // High: compiler plugins run arbitrary code during compilation
    const pluginPattern = /addCompilerPlugin\s*\(([^)]+)\)/g;
    while ((match = pluginPattern.exec(content)) !== null) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'compiler-plugin',
        'Compiler plugin executes arbitrary code during compilation',
        'high', match[0]));
    }

    // Medium: custom TaskKey definitions can hook into build lifecycle
    const taskKeyPattern = /TaskKey\s*\[/g;
    while ((match = taskKeyPattern.exec(content)) !== null) {
      const context = content.substring(match.index, Math.min(content.length, match.index + 120));
      signals.push(createSignal(filePath, this.language, 'install-script', 'custom-task-key',
        'Custom TaskKey can hook into the sbt build lifecycle',
        'medium', context.trim()));
    }

    // High: non-standard resolvers may serve untrusted artifacts
    const resolverPattern = /resolvers\s*\+?=\s*(?:"[^"]*"\s+at\s+"([^"]+)"|Seq\()/g;
    while ((match = resolverPattern.exec(content)) !== null) {
      const url = match[1] ?? match[0];
      if (!/maven[._-]?central|repo1\.maven|jcenter|sonatype/i.test(url)) {
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'non-standard-resolver',
          'Non-standard resolver may serve untrusted or compromised artifacts',
          'high', match[0]));
      }
    }

    return signals;
  }
}
