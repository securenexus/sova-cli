import { describe, it, expect } from 'vitest';
import { HaxeSignals } from '../../../src/security/signals/haxe-signals.js';

const detector = new HaxeSignals();
const HAXELIB = '/project/haxelib.json';

describe('HaxeSignals', () => {
  it('language property is "haxe"', () => {
    expect(detector.language).toBe('haxe');
  });

  it('ignores files other than haxelib.json', () => {
    expect(detector.detect('/project/Main.hx', '{"postInstall":"x"}')).toEqual([]);
  });

  it('returns no signals when the JSON is malformed', () => {
    expect(detector.detect(HAXELIB, '{ not valid json')).toEqual([]);
  });

  it('flags postInstall as high', () => {
    const s = detector.detect(HAXELIB, JSON.stringify({ postInstall: 'run.sh' }))
      .find(x => x.type === 'haxelib-post-install');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
    expect(s!.content).toBe('run.sh');
  });

  it('flags an http dependency URL as medium', () => {
    const json = JSON.stringify({ dependencies: { lib: 'https://example.com/lib.zip' } });
    const s = detector.detect(HAXELIB, json).find(x => x.type === 'haxelib-git-dep');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('dependency-confusion');
    expect(s!.description).toContain('lib');
  });

  it('flags a git+https dependency', () => {
    const json = JSON.stringify({ dependencies: { lib: 'git+https://x/a.git' } });
    expect(detector.detect(HAXELIB, json).some(x => x.type === 'haxelib-git-dep')).toBe(true);
  });

  it('accepts plain registry version dependencies', () => {
    const json = JSON.stringify({ dependencies: { lime: '8.0.0' } });
    expect(detector.detect(HAXELIB, json)).toEqual([]);
  });

  it('handles a haxelib.json with no dependencies key', () => {
    expect(detector.detect(HAXELIB, JSON.stringify({ name: 'demo' }))).toEqual([]);
  });

  it('emits one signal per offending dependency', () => {
    const json = JSON.stringify({ dependencies: { a: 'https://x/a.zip', b: 'git://x/b', c: '1.0.0' } });
    const signals = detector.detect(HAXELIB, json).filter(x => x.type === 'haxelib-git-dep');
    expect(signals).toHaveLength(2);
  });
});
