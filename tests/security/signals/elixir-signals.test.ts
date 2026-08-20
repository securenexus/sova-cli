import { describe, it, expect } from 'vitest';
import { ElixirSignals } from '../../../src/security/signals/elixir-signals.js';

const detector = new ElixirSignals();
const MIX = '/project/mix.exs';

describe('ElixirSignals', () => {
  it('language property is "elixir"', () => {
    expect(detector.language).toBe('elixir');
  });

  it('ignores files other than mix.exs', () => {
    expect(detector.detect('/project/lib/app.ex', 'compilers: [:custom]')).toEqual([]);
  });

  it('flags a custom compilers list as high', () => {
    const s = detector.detect(MIX, 'compilers: [:custom, :elixir]')
      .find(x => x.type === 'custom-compilers');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('flags an alias that shells out as high', () => {
    const content = 'defp aliases do\n  [setup: fn _ -> System.cmd("sh", ["-c", "x"]) end]\nend';
    const s = detector.detect(MIX, content).find(x => x.type === 'alias-shell-command');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
  });

  it('flags a git dependency as high dependency-confusion', () => {
    const s = detector.detect(MIX, '{:mypkg, git: "https://github.com/a/b.git"}')
      .find(x => x.type === 'git-dependency');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('dependency-confusion');
  });

  it('emits one signal per git dependency', () => {
    const content = '{:a, git: "https://x/a.git"},\n{:b, git: "https://x/b.git"}';
    const signals = detector.detect(MIX, content).filter(x => x.type === 'git-dependency');
    expect(signals).toHaveLength(2);
  });

  it('returns nothing for a plain Hex-only mix.exs', () => {
    expect(detector.detect(MIX, 'defp deps do\n  [{:jason, "~> 1.4"}]\nend')).toEqual([]);
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(MIX, 'compilers: [:custom]');
    expect(signals[0].file).toBe(MIX);
    expect(signals[0].language).toBe('elixir');
  });
});
