/**
 * C/C++ security signal detection (CMakeLists.txt, conanfile.py).
 */
import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class CSignals implements ISignalDetector {
  language = 'c';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];
    const name = filePath.split('/').pop() ?? '';

    if (name === 'CMakeLists.txt') {
      if (/execute_process\s*\(/.test(content)) {
        signals.push(createSignal(filePath, this.language, 'install-script', 'cmake-execute-process',
          'execute_process() runs arbitrary commands during CMake configure',
          'critical', content.match(/execute_process\s*\([^)]{0,200}/)?.[0]));
      }
      if (/ExternalProject_Add\s*\(/.test(content)) {
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'cmake-external-project',
          'ExternalProject_Add downloads and builds code from external sources',
          'critical', content.match(/ExternalProject_Add\s*\([^)]{0,200}/)?.[0]));
      }
      if (/FetchContent_Declare\s*\(/.test(content)) {
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'cmake-fetch-content',
          'FetchContent_Declare fetches external code during configure',
          'high', content.match(/FetchContent_Declare\s*\([^)]{0,200}/)?.[0]));
      }
    }

    if (name === 'conanfile.py') {
      if (/def\s+build\s*\(/.test(content)) {
        signals.push(createSignal(filePath, this.language, 'install-script', 'conan-custom-build',
          'conanfile.py defines build() — runs custom build logic during install',
          'high', content.match(/def\s+build\s*\([^)]*\)[\s\S]{0,200}/)?.[0]));
      }
      if (/def\s+source\s*\(/.test(content)) {
        signals.push(createSignal(filePath, this.language, 'install-script', 'conan-custom-source',
          'conanfile.py defines source() — downloads content during install',
          'high', content.match(/def\s+source\s*\([^)]*\)[\s\S]{0,200}/)?.[0]));
      }
    }

    return signals;
  }
}
