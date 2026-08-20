import { describe, it, expect } from 'vitest';
import { HaskellSignals } from '../../../src/security/signals/haskell-signals.js';

const detector = new HaskellSignals();
const CABAL = '/project/demo.cabal';

describe('HaskellSignals', () => {
  it('language property is "haskell"', () => {
    expect(detector.language).toBe('haskell');
  });

  it('ignores files that are not .cabal', () => {
    expect(detector.detect('/project/Main.hs', 'custom-setup')).toEqual([]);
  });

  it('flags a custom-setup section as high', () => {
    const s = detector.detect(CABAL, 'custom-setup\n  setup-depends: base, Cabal\n')
      .find(x => x.type === 'custom-setup');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('flags build-tools as medium', () => {
    const s = detector.detect(CABAL, 'library\n  build-tools: alex, happy\n')
      .find(x => x.type === 'build-tools');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
  });

  it('flags the singular build-tool spelling too', () => {
    const signals = detector.detect(CABAL, 'library\n  build-tool: alex\n');
    expect(signals.some(x => x.type === 'build-tools')).toBe(true);
  });

  it('flags c-sources as medium native-code', () => {
    const s = detector.detect(CABAL, 'library\n  c-sources: cbits/fast.c\n')
      .find(x => x.type === 'c-sources');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('native-code');
  });

  it('flags extra-libraries as medium native-code', () => {
    const s = detector.detect(CABAL, 'library\n  extra-libraries: ssl, crypto\n')
      .find(x => x.type === 'extra-libraries');
    expect(s).toBeDefined();
    expect(s!.category).toBe('native-code');
  });

  it('returns nothing for a plain cabal file', () => {
    expect(detector.detect(CABAL, 'name: demo\nversion: 0.1.0\nbuild-depends: base\n')).toEqual([]);
  });

  it('detects several cabal signals together', () => {
    const content = 'custom-setup\n  setup-depends: Cabal\nlibrary\n  c-sources: a.c\n  extra-libraries: ssl\n';
    const types = detector.detect(CABAL, content).map(s => s.type);
    expect(types).toContain('custom-setup');
    expect(types).toContain('c-sources');
    expect(types).toContain('extra-libraries');
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(CABAL, 'custom-setup\n  setup-depends: Cabal\n');
    expect(signals[0].file).toBe(CABAL);
    expect(signals[0].language).toBe('haskell');
  });
});
