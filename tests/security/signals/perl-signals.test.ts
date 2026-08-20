import { describe, it, expect } from 'vitest';
import { PerlSignals } from '../../../src/security/signals/perl-signals.js';

const detector = new PerlSignals();
const MAKEFILE = '/project/Makefile.PL';

describe('PerlSignals', () => {
  it('language property is "perl"', () => {
    expect(detector.language).toBe('perl');
  });

  it('ignores files other than Makefile.PL', () => {
    expect(detector.detect('/project/lib/App.pm', 'WriteMakefile( sub foo {} )')).toEqual([]);
  });

  it('flags WriteMakefile containing a postamble as high', () => {
    const s = detector.detect(MAKEFILE, 'WriteMakefile(\n  NAME => "Demo",\n  postamble => "x"\n);')
      .find(x => x.type === 'custom-makefile-command');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('flags a MY:: override', () => {
    const signals = detector.detect(MAKEFILE, 'WriteMakefile(NAME => "D");\npackage MY::;');
    expect(signals.some(x => x.type === 'custom-makefile-command')).toBe(true);
  });

  it('flags a custom sub inside WriteMakefile', () => {
    const signals = detector.detect(MAKEFILE, 'WriteMakefile(\n  NAME => "D",\n  sub build {}\n);');
    expect(signals.some(x => x.type === 'custom-makefile-command')).toBe(true);
  });

  it('flags .xs references as medium native-code', () => {
    const s = detector.detect(MAKEFILE, 'my $xs = "Demo.xs";')
      .find(x => x.type === 'xs-native-code');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('native-code');
  });

  it('returns nothing for a plain Makefile.PL', () => {
    expect(detector.detect(MAKEFILE, 'use ExtUtils::MakeMaker;\nWriteMakefile(NAME => "Demo");')).toEqual([]);
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(MAKEFILE, 'Demo.xs');
    expect(signals[0].file).toBe(MAKEFILE);
    expect(signals[0].language).toBe('perl');
  });
});
