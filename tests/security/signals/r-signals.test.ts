import { describe, it, expect } from 'vitest';
import { RSignals } from '../../../src/security/signals/r-signals.js';

const detector = new RSignals();
const DESC = '/project/DESCRIPTION';

describe('RSignals', () => {
  it('language property is "r"', () => {
    expect(detector.language).toBe('r');
  });

  it('ignores files other than DESCRIPTION', () => {
    expect(detector.detect('/project/R/app.R', 'Remotes: github::a/b')).toEqual([]);
  });

  it('flags SystemRequirements as medium native-code', () => {
    const s = detector.detect(DESC, 'Package: demo\nSystemRequirements: GNU make\n')
      .find(x => x.type === 'r-system-requirements');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('native-code');
  });

  it('flags NeedsCompilation: yes as medium', () => {
    const s = detector.detect(DESC, 'Package: demo\nNeedsCompilation: yes\n')
      .find(x => x.type === 'r-needs-compilation');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.content).toBe('NeedsCompilation: yes');
  });

  it('does not flag NeedsCompilation: no', () => {
    const signals = detector.detect(DESC, 'Package: demo\nNeedsCompilation: no\n');
    expect(signals.some(x => x.type === 'r-needs-compilation')).toBe(false);
  });

  it('flags a Remotes field as high dependency-confusion', () => {
    const s = detector.detect(DESC, 'Package: demo\nRemotes: github::hadley/dplyr\n')
      .find(x => x.type === 'r-remotes');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('dependency-confusion');
  });

  it('flags a configure script reference as high', () => {
    const s = detector.detect(DESC, 'Package: demo\nNote: runs configure at install\n')
      .find(x => x.type === 'r-configure-script');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('returns nothing for a plain CRAN DESCRIPTION', () => {
    expect(detector.detect(DESC, 'Package: demo\nVersion: 1.0\nLicense: MIT\n')).toEqual([]);
  });

  it('detects several DESCRIPTION signals together', () => {
    const content = 'Package: demo\nSystemRequirements: make\nNeedsCompilation: yes\nRemotes: a/b\n';
    const types = detector.detect(DESC, content).map(s => s.type);
    expect(types).toContain('r-system-requirements');
    expect(types).toContain('r-needs-compilation');
    expect(types).toContain('r-remotes');
  });
});
