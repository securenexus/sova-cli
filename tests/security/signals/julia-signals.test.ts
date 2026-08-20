import { describe, it, expect } from 'vitest';
import { JuliaSignals } from '../../../src/security/signals/julia-signals.js';

const detector = new JuliaSignals();
const PROJ = '/project/Project.toml';

describe('JuliaSignals', () => {
  it('language property is "julia"', () => {
    expect(detector.language).toBe('julia');
  });

  it('ignores files other than Project.toml', () => {
    expect(detector.detect('/project/src/App.jl', 'deps/build.jl')).toEqual([]);
  });

  it('flags a deps/build.jl reference as high', () => {
    const s = detector.detect(PROJ, 'build = "deps/build.jl"')
      .find(x => x.type === 'julia-build-script');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('flags a bare build.jl reference too', () => {
    const signals = detector.detect(PROJ, 'script = "build.jl"');
    expect(signals.some(x => x.type === 'julia-build-script')).toBe(true);
  });

  it('flags BinaryBuilder as medium native-code', () => {
    const s = detector.detect(PROJ, 'BinaryBuilder = "12aac903"')
      .find(x => x.type === 'julia-binary-builder');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('native-code');
  });

  it('flags BinaryProvider and JLLWrappers as well', () => {
    expect(detector.detect(PROJ, 'BinaryProvider = "x"').some(x => x.type === 'julia-binary-builder')).toBe(true);
    expect(detector.detect(PROJ, 'JLLWrappers = "x"').some(x => x.type === 'julia-binary-builder')).toBe(true);
  });

  it('returns nothing for a plain Project.toml', () => {
    expect(detector.detect(PROJ, 'name = "Demo"\nuuid = "abc"\n[deps]\nJSON = "682c06a0"')).toEqual([]);
  });

  it('detects both signal kinds together', () => {
    const types = detector.detect(PROJ, 'build.jl\nBinaryBuilder').map(s => s.type);
    expect(types).toContain('julia-build-script');
    expect(types).toContain('julia-binary-builder');
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(PROJ, 'build.jl');
    expect(signals[0].file).toBe(PROJ);
    expect(signals[0].language).toBe('julia');
  });
});
