/**
 * Python security signal detection (setup.py, pyproject.toml, requirements.txt).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';
import {
  detectObfuscationInScript,
  detectGitUrlDependency,
  detectUrlDependency,
} from './base-signals.js';

export class PythonSignals implements ISignalDetector {
  language = 'python';

  detect(filePath: string, content: string): SecuritySignal[] {
    const base = filePath.split('/').pop() ?? '';
    const signals: SecuritySignal[] = [];

    if (base === 'setup.py') signals.push(...this.detectSetupPy(filePath, content));
    else if (base === 'pyproject.toml') signals.push(...this.detectPyproject(filePath, content));
    else if (base === 'requirements.txt') signals.push(...this.detectRequirements(filePath, content));

    signals.push(...this.detectSourcePatterns(filePath, content));
    return signals;
  }

  private detectSetupPy(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    if (/\bcmdclass\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'cmdclass-override',
        'setup.py overrides cmdclass -- runs arbitrary code during install',
        'critical', content.substring(0, 300)));
    }

    if (/\bsetup_requires\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'setup-requires',
        'setup_requires can trigger code execution before install completes',
        'high'));
    }

    if (/\bext_modules\b/.test(content)) {
      signals.push(createSignal(file, this.language, 'native-code', 'ext-modules',
        'Package compiles native C/C++ extensions',
        'medium'));
    }

    signals.push(...detectObfuscationInScript(file, this.language, content));

    return signals;
  }

  private detectPyproject(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: cmdclass in setuptools config
    if (/\[tool\.setuptools\.cmdclass\]/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'toml-cmdclass',
        'pyproject.toml defines custom cmdclass -- runs code during install',
        'critical'));
    }

    // High: non-standard build backend
    const backendMatch = content.match(/build-backend\s*=\s*"([^"]+)"/);
    if (backendMatch) {
      const standard = ['setuptools.build_meta', 'flit_core.buildapi', 'hatchling.build', 'poetry.core.masonry.api', 'maturin'];
      if (!standard.some(s => backendMatch[1].includes(s))) {
        signals.push(createSignal(file, this.language, 'install-script', 'custom-build-backend',
          `Non-standard build backend: ${backendMatch[1]}`,
          'high', backendMatch[0]));
      }
    }

    return signals;
  }

  private detectRequirements(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('--extra-index-url')) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'extra-index-url',
          'Extra index URL enables dependency confusion attacks',
          'critical', trimmed));
      } else if (trimmed.startsWith('--index-url')) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'custom-index-url',
          'Custom index URL -- packages may not be verified',
          'high', trimmed));
      }

      const gitSig = detectGitUrlDependency(file, this.language, trimmed);
      if (gitSig) signals.push(gitSig);

      const urlSig = detectUrlDependency(file, this.language, trimmed);
      if (urlSig) signals.push(urlSig);
    }

    return signals;
  }

  private detectSourcePatterns(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // unsafe-deserialization
    if (/\byaml\.load\s*\(/.test(content) && !/Loader\s*=\s*SafeLoader/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-deserialization', 'yaml-unsafe-load',
        'yaml.load() without SafeLoader — arbitrary code execution risk', 'critical'));
    }
    if (/\bpickle\.(load|loads)\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-deserialization', 'pickle-load',
        'pickle deserialization — arbitrary code execution risk', 'critical'));
    }

    // code-injection
    if (/\beval\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'eval-call',
        'eval() usage — potential code injection', 'critical'));
    }
    if (/\bexec\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'exec-call',
        'exec() usage — potential code injection', 'critical'));
    }
    if (/subprocess\.call\([^)]*shell\s*=\s*True/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'subprocess-shell',
        'subprocess with shell=True — command injection risk', 'critical'));
    }

    // unsafe-archive-extraction
    if (/\b(zipfile\.extractall|tarfile\.extractall)\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-archive-extraction', 'archive-extractall',
        'Archive extractall() without member validation — zip-slip risk', 'high'));
    }

    return signals;
  }
}
