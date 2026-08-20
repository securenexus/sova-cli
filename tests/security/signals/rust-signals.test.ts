import { describe, it, expect } from 'vitest';
import { RustSignals } from '../../../src/security/signals/rust-signals.js';

const detector = new RustSignals();
const CARGO = '/project/Cargo.toml';
const BUILD = '/project/build.rs';

describe('RustSignals', () => {
  it('language property is "rust"', () => {
    expect(detector.language).toBe('rust');
  });

  it('ignores unrelated files', () => {
    expect(detector.detect('/project/src/main.rs', '[build-dependencies]')).toEqual([]);
  });

  describe('Cargo.toml', () => {
    it('flags a build.rs declaration as critical', () => {
      const s = detector.detect(CARGO, '[package]\nbuild = "build.rs"\n')
        .find(x => x.type === 'build-script');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
    });

    it('flags a build-dependencies section as high', () => {
      const s = detector.detect(CARGO, '[build-dependencies]\ncc = "1.0"\n')
        .find(x => x.type === 'build-dependencies');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
    });

    it('flags a proc-macro crate as medium', () => {
      const s = detector.detect(CARGO, '[lib]\nproc-macro = true\n')
        .find(x => x.type === 'proc-macro');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('medium');
      expect(s!.category).toBe('native-code');
    });

    it('flags the links key as medium native-code', () => {
      const s = detector.detect(CARGO, '[package]\nlinks = "ssl"\n')
        .find(x => x.type === 'links-key');
      expect(s).toBeDefined();
      expect(s!.category).toBe('native-code');
    });

    it('flags each git dependency as high', () => {
      const content = '[dependencies]\na = { git = "https://x/a.git" }\nb = { git = "https://x/b.git" }\n';
      const signals = detector.detect(CARGO, content).filter(x => x.type === 'git-dependency');
      expect(signals).toHaveLength(2);
      expect(signals[0].severity).toBe('high');
    });

    it('flags each path dependency as medium', () => {
      const s = detector.detect(CARGO, '[dependencies]\nlocal = { path = "../local" }\n')
        .find(x => x.type === 'path-dependency');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('medium');
      expect(s!.content).toBe('path = "../local"');
    });

    it('returns nothing for a plain crates.io manifest', () => {
      expect(detector.detect(CARGO, '[package]\nname = "demo"\n\n[dependencies]\nserde = "1.0"\n')).toEqual([]);
    });
  });

  describe('build.rs', () => {
    it('always flags the existence of build.rs as critical', () => {
      const s = detector.detect(BUILD, 'fn main() {}')
        .find(x => x.type === 'build-rs-exists');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
    });

    it('also reports obfuscation signals found in the script', () => {
      const content = 'fn main() { let s = "' + 'A'.repeat(300) + '"; }';
      const signals = detector.detect(BUILD, content);
      expect(signals.some(x => x.type === 'build-rs-exists')).toBe(true);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });

    it('records file and language on signals', () => {
      const signals = detector.detect(BUILD, 'fn main() {}');
      expect(signals[0].file).toBe(BUILD);
      expect(signals[0].language).toBe('rust');
    });
  });
});
