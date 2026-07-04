/**
 * Terraform security signal detection (.tf files).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class TerraformSignals implements ISignalDetector {
  language = 'terraform';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('.tf')) return [];

    const signals: SecuritySignal[] = [];

    // Critical: local-exec provisioner runs arbitrary shell commands
    if (/provisioner\s+"local-exec"/.test(content)) {
      const match = content.match(/provisioner\s+"local-exec"\s*\{[^}]*/);
      signals.push(createSignal(filePath, this.language, 'install-script', 'local-exec-provisioner',
        'Terraform local-exec provisioner runs arbitrary commands on the host',
        'critical', match?.[0]));
    }

    // Critical: remote-exec provisioner runs commands on provisioned infra
    if (/provisioner\s+"remote-exec"/.test(content)) {
      const match = content.match(/provisioner\s+"remote-exec"\s*\{[^}]*/);
      signals.push(createSignal(filePath, this.language, 'install-script', 'remote-exec-provisioner',
        'Terraform remote-exec provisioner runs commands on remote infrastructure',
        'critical', match?.[0]));
    }

    // High: external data source executes a local program
    if (/data\s+"external"/.test(content)) {
      const match = content.match(/data\s+"external"\s+"[^"]*"\s*\{[^}]*/);
      signals.push(createSignal(filePath, this.language, 'install-script', 'external-data-source',
        'External data source executes a local program and reads its output',
        'high', match?.[0]));
    }

    // High: git-sourced modules can change without pinning
    const gitSources = [...content.matchAll(/source\s*=\s*"(git::[^"]+)"/g)];
    for (const m of gitSources) {
      signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'git-module-source',
        'Terraform module sourced from git — verify ref pinning',
        'high', m[1]));
    }

    // High: https-sourced modules
    const httpsSources = [...content.matchAll(/source\s*=\s*"(https?:\/\/[^"]+)"/g)];
    for (const m of httpsSources) {
      signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'https-module-source',
        'Terraform module sourced from HTTPS URL — no registry integrity checks',
        'high', m[1]));
    }

    return signals;
  }
}
