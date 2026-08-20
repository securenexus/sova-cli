import { describe, it, expect } from 'vitest';
import { OcamlSignals } from '../../../src/security/signals/ocaml-signals.js';

const detector = new OcamlSignals();
const OPAM = '/project/demo.opam';
const DUNE = '/project/dune-project';

describe('OcamlSignals', () => {
  it('language property is "ocaml"', () => {
    expect(detector.language).toBe('ocaml');
  });

  it('ignores unrelated files', () => {
    expect(detector.detect('/project/main.ml', 'build: [ ["make"] ]')).toEqual([]);
  });

  describe('opam', () => {
    it('flags a custom build block as high', () => {
      const s = detector.detect(OPAM, 'build: [ ["dune" "build"] ]')
        .find(x => x.type === 'opam-custom-build');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
      expect(s!.category).toBe('install-script');
    });

    it('flags pin-depends referencing git as high', () => {
      const s = detector.detect(OPAM, 'pin-depends: [\n  ["pkg.dev" "git+https://x/a.git"]\n]')
        .find(x => x.type === 'opam-pin-depends');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
      expect(s!.category).toBe('dependency-confusion');
    });

    it('handles a file literally named opam', () => {
      const signals = detector.detect('/project/opam', 'build: [ ["make"] ]');
      expect(signals.some(x => x.type === 'opam-custom-build')).toBe(true);
    });

    it('returns nothing for a plain opam file', () => {
      expect(detector.detect(OPAM, 'opam-version: "2.0"\nmaintainer: "x@y.z"')).toEqual([]);
    });
  });

  describe('dune', () => {
    it('flags foreign_stubs as medium native-code', () => {
      const s = detector.detect(DUNE, '(executable\n (name main)\n (foreign_stubs (language c) (names stubs)))')
        .find(x => x.type === 'dune-foreign-stubs');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('medium');
      expect(s!.category).toBe('native-code');
    });

    it('handles a file named dune', () => {
      const signals = detector.detect('/project/dune', '(executable (name m) (foreign_stubs (language c)))');
      expect(signals.some(x => x.type === 'dune-foreign-stubs')).toBe(true);
    });

    it('returns nothing for a dune file without foreign stubs', () => {
      expect(detector.detect(DUNE, '(lang dune 3.0)')).toEqual([]);
    });

    it('does not apply opam rules to dune files', () => {
      expect(detector.detect(DUNE, 'build: [ ["make"] ]')).toEqual([]);
    });
  });
});
