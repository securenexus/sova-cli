import { describe, it, expect } from 'vitest';
import { DockerSignals } from '../../../src/security/signals/docker-signals.js';

const detector = new DockerSignals();
const DOCKERFILE = '/project/Dockerfile';
const COMPOSE = '/project/docker-compose.yml';

describe('DockerSignals', () => {
  it('language property is "docker"', () => {
    expect(detector.language).toBe('docker');
  });

  it('ignores unrelated files', () => {
    expect(detector.detect('/project/README.md', 'privileged: true')).toEqual([]);
  });

  describe('Dockerfile', () => {
    it('flags curl piped to shell as critical', () => {
      const s = detector.detect(DOCKERFILE, 'FROM alpine\nUSER app\nRUN curl -sL http://x/i.sh | sh')
        .find(x => x.type === 'piped-remote-exec');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
    });

    it('flags wget piped to bash as critical', () => {
      const signals = detector.detect(DOCKERFILE, 'USER app\nRUN wget -O - http://x | bash');
      expect(signals.some(x => x.type === 'piped-remote-exec')).toBe(true);
    });

    it('flags ADD from a remote URL as critical', () => {
      const s = detector.detect(DOCKERFILE, 'USER app\nADD https://x/pkg.tar.gz /tmp/')
        .find(x => x.type === 'add-remote-url');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
    });

    it('flags a Dockerfile with no USER directive as high', () => {
      const s = detector.detect(DOCKERFILE, 'FROM alpine\nRUN apk add curl')
        .find(x => x.type === 'no-user-directive');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
      expect(s!.category).toBe('suspicious-metadata');
    });

    it('flags a final USER of root', () => {
      const s = detector.detect(DOCKERFILE, 'FROM alpine\nUSER app\nUSER root')
        .find(x => x.type === 'runs-as-root');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
      expect(s!.content).toBe('USER root');
    });

    it('accepts a non-root final USER', () => {
      const signals = detector.detect(DOCKERFILE, 'FROM alpine\nUSER root\nRUN x\nUSER app');
      expect(signals.some(x => x.type === 'runs-as-root')).toBe(false);
      expect(signals.some(x => x.type === 'no-user-directive')).toBe(false);
    });

    it('matches suffixed Dockerfile names', () => {
      const signals = detector.detect('/project/Dockerfile.prod', 'FROM alpine');
      expect(signals.some(x => x.type === 'no-user-directive')).toBe(true);
    });
  });

  describe('docker-compose', () => {
    it('flags a privileged service as critical', () => {
      const s = detector.detect(COMPOSE, 'services:\n  app:\n    privileged: true')
        .find(x => x.type === 'privileged-container');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('suspicious-metadata');
    });

    it('returns nothing for a benign compose file', () => {
      expect(detector.detect(COMPOSE, 'services:\n  app:\n    image: nginx')).toEqual([]);
    });

    it('matches the .yaml extension too', () => {
      const signals = detector.detect('/project/docker-compose.prod.yaml', 'privileged: true');
      expect(signals.some(x => x.type === 'privileged-container')).toBe(true);
    });

    it('does not apply Dockerfile rules to compose files', () => {
      expect(detector.detect(COMPOSE, 'image: alpine')).toEqual([]);
    });
  });
});
