import { describe, it, expect } from 'vitest';
import { ErlangSignals } from '../../../src/security/signals/erlang-signals.js';

const detector = new ErlangSignals();
const REBAR = '/project/rebar.config';

describe('ErlangSignals', () => {
  it('language property is "erlang"', () => {
    expect(detector.language).toBe('erlang');
  });

  it('ignores files other than rebar.config', () => {
    expect(detector.detect('/project/src/app.erl', '{pre_hooks, [{compile, "sh x"}]}')).toEqual([]);
  });

  it('flags pre_hooks as critical', () => {
    const s = detector.detect(REBAR, '{pre_hooks, [{compile, "make -C c_src"}]}.')
      .find(x => x.type === 'pre-hooks');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('critical');
    expect(s!.category).toBe('install-script');
  });

  it('flags post_hooks as critical', () => {
    const s = detector.detect(REBAR, '{post_hooks, [{clean, "rm -rf priv"}]}.')
      .find(x => x.type === 'post-hooks');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('critical');
  });

  it('flags provider_hooks as high', () => {
    const s = detector.detect(REBAR, '{provider_hooks, [{pre, [{compile, {pc, compile}}]}]}.')
      .find(x => x.type === 'provider-hooks');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
  });

  it('flags port_specs as medium native-code', () => {
    const s = detector.detect(REBAR, '{port_specs, [{"priv/nif.so", ["c_src/*.c"]}]}.')
      .find(x => x.type === 'port-specs');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('native-code');
  });

  it('returns nothing for a plain rebar.config', () => {
    expect(detector.detect(REBAR, '{deps, [{jsx, "3.1.0"}]}.')).toEqual([]);
  });

  it('detects multiple hook kinds in one file', () => {
    const content = '{pre_hooks, [{compile, "a"}]}.\n{post_hooks, [{compile, "b"}]}.';
    const types = detector.detect(REBAR, content).map(s => s.type);
    expect(types).toContain('pre-hooks');
    expect(types).toContain('post-hooks');
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(REBAR, '{pre_hooks, [{compile, "x"}]}.');
    expect(signals[0].file).toBe(REBAR);
    expect(signals[0].language).toBe('erlang');
  });
});
