/**
 * .NET security signal detection (.csproj, .nuspec).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class DotnetSignals implements ISignalDetector {
  language = 'dotnet';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (filePath.endsWith('.csproj')) return this.detectCsproj(filePath, content);
    if (filePath.endsWith('.nuspec')) return this.detectNuspec(filePath, content);
    return [];
  }

  private detectCsproj(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: arbitrary command execution via Exec targets
    const execMatch = content.match(/<Exec\s+Command=["']([^"']+)/);
    if (execMatch) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'exec-command',
        'MSBuild <Exec Command> runs arbitrary shell commands during build',
        'critical', execMatch[0]));
    }

    // High: custom BeforeTargets="Build" can inject pre-build execution
    const beforeBuild = content.match(/<Target[^>]*BeforeTargets\s*=\s*["']Build["'][^>]*/);
    if (beforeBuild) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'before-build-target',
        'Custom MSBuild target runs before build — can execute code on restore/build',
        'high', beforeBuild[0]));
    }

    // Medium: native code reference
    if (/<NativeReference\b/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'native-code', 'native-reference',
        'Project includes NativeReference — links to unmanaged native binaries',
        'medium'));
    }

    return signals;
  }

  private detectNuspec(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: PowerShell scripts bundled in NuGet package
    const ps1Match = content.match(/<file[^>]+src=["'][^"']*\.ps1["'][^>]*/);
    if (ps1Match) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'nuget-ps1-script',
        'NuGet package bundles PowerShell .ps1 scripts — execute on install/uninstall',
        'critical', ps1Match[0]));
    }

    return signals;
  }
}
