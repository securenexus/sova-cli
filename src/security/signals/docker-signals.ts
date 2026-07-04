/**
 * Docker security signal detection (Dockerfile, docker-compose.yml).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';

export class DockerSignals implements ISignalDetector {
  language = 'docker';

  detect(filePath: string, content: string): SecuritySignal[] {
    const name = filePath.split('/').pop() ?? '';
    if (/^Dockerfile/.test(name)) return this.detectDockerfile(filePath, content);
    if (/docker-compose.*\.ya?ml$/.test(name)) return this.detectCompose(filePath, content);
    return [];
  }

  private detectDockerfile(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: piped remote execution (curl/wget | bash)
    const pipedExec = content.match(/RUN\s+.*(curl|wget)\s+[^\n]*\|\s*(ba)?sh/m);
    if (pipedExec) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'piped-remote-exec',
        'Dockerfile pipes remote content to shell — executes arbitrary code',
        'critical', pipedExec[0]));
    }

    // Critical: ADD from remote URL
    const addUrl = content.match(/^ADD\s+https?:\/\/\S+/m);
    if (addUrl) {
      signals.push(createSignal(filePath, this.language, 'install-script', 'add-remote-url',
        'ADD fetches remote content without checksum verification',
        'critical', addUrl[0]));
    }

    // High: running as root (last USER is root, or no USER directive at all)
    const userDirectives = [...content.matchAll(/^USER\s+(\S+)/gm)];
    if (userDirectives.length === 0) {
      signals.push(createSignal(filePath, this.language, 'suspicious-metadata', 'no-user-directive',
        'Dockerfile has no USER directive — container runs as root',
        'high'));
    } else {
      const lastUser = userDirectives[userDirectives.length - 1][1];
      if (lastUser === 'root') {
        signals.push(createSignal(filePath, this.language, 'suspicious-metadata', 'runs-as-root',
          'Dockerfile final USER is root — container runs with full privileges',
          'high', `USER ${lastUser}`));
      }
    }

    return signals;
  }

  private detectCompose(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: privileged containers
    if (/privileged:\s*true/m.test(content)) {
      signals.push(createSignal(filePath, this.language, 'suspicious-metadata', 'privileged-container',
        'docker-compose service runs in privileged mode — full host access',
        'critical'));
    }

    return signals;
  }
}
