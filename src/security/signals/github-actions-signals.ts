/**
 * GitHub Actions security signal detection (.yml workflow files).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

/**
 * Matches `curl ... | sh` / `wget ... | bash` on a single line.
 * Deliberately linear — see the note in detect() before changing it.
 */
const PIPED_REMOTE_EXEC = /(?:curl|wget)\s+[^|\n]*\|\s*(?:ba)?sh\b/;

export class GithubActionsSignals implements ISignalDetector {
  language = 'github-actions';

  detect(filePath: string, content: string): SecuritySignal[] {
    if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) return [];

    const signals: SecuritySignal[] = [];

    // Critical: piped remote execution in run steps (curl/wget | bash/sh).
    //
    // Scanned line by line on purpose. The previous implementation used a
    // single regex spanning a whole `run: |` block:
    //   /run:\s*\|\n(?:[ \t]+[^\n]*\n)*?[ \t]+.*(?:curl|wget).../
    // The lazy group and the trailing `[ \t]+.*` can both consume the same
    // indented line, so the ways to split a block grow exponentially with its
    // line count. With no curl/wget present to terminate the match — the
    // common case — the engine explores every split before failing, hanging
    // the scan indefinitely on an ordinary workflow file. A file with a 30
    // line `run: |` block was enough to spin forever.
    //
    // This pattern is linear: `[^|\n]*` cannot cross the `|` it is anchored
    // against, so there is no ambiguity to backtrack through.
    for (const line of content.split('\n')) {
      if (PIPED_REMOTE_EXEC.test(line)) {
        signals.push(createSignal(filePath, this.language, 'install-script', 'piped-remote-exec',
          'Workflow step pipes remote content to shell — arbitrary code execution',
          'critical', line.trim()));
      }
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
