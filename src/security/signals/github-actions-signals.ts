/**
 * GitHub Actions security signal detection (.yml workflow files).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class GithubActionsSignals implements ISignalDetector {
  language = 'github-actions';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) return [];

    const signals: SecuritySignal[] = [];

    // Critical: piped remote execution in run steps (curl/wget | bash/sh)
    const pipedLines = [...content.matchAll(/run:.*(?:curl|wget)\s+[^\n]*\|\s*(?:ba)?sh/g)];
    // Also check multiline run blocks
    const multilinePiped = [...content.matchAll(/run:\s*\|\n(?:[ \t]+[^\n]*\n)*?[ \t]+.*(?:curl|wget)\s+[^\n]*\|\s*(?:ba)?sh/g)];
    for (const m of [...pipedLines, ...multilinePiped]) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'piped-remote-exec',
        'Workflow step pipes remote content to shell — arbitrary code execution',
        'critical', m[0]));
    }

    // High: uses without SHA pinning (uses @v* tag instead of @sha)
    const usesEntries = [...content.matchAll(/uses:\s*([^\s#]+)/g)];
    for (const m of usesEntries) {
      const ref = m[1];
      // SHA pins are 40-char hex after @
      if (/@v\d/.test(ref) && !/@[0-9a-f]{40}/.test(ref)) {
        signals.push(createSignal(filePath, this.language, 'dependency-confusion', 'unpinned-action',
          `Action "${ref}" uses tag ref instead of SHA pin — vulnerable to tag mutation`,
          'high', ref));
      }
    }

    // High: overly permissive write-all permissions
    if (/permissions:\s*write-all/.test(content)) {
      signals.push(createSignal(filePath, this.language, 'suspicious-metadata', 'write-all-permissions',
        'Workflow requests write-all permissions — excessive privilege scope',
        'high'));
    }

    return signals;
  }
}
