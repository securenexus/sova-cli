import { describe, it, expect } from 'vitest';
import { DartSignals } from '../../../src/security/signals/dart-signals.js';

const detector = new DartSignals();
const PUBSPEC = '/project/pubspec.yaml';

describe('DartSignals', () => {
  it('language property is "dart"', () => {
    expect(detector.language).toBe('dart');
  });

  it('ignores files that are not pubspec.yaml', () => {
    expect(detector.detect('/project/lib/main.dart', 'executables:\n  cli: main')).toEqual([]);
  });

  it('flags an executables section as medium', () => {
    const s = detector.detect(PUBSPEC, 'name: demo\nexecutables:\n  demo: main')
      .find(x => x.type === 'executables');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('install-script');
    expect(s!.content).toBe('executables:');
  });

  it('flags a git dependency as high', () => {
    const content = 'dependencies:\n  pkg:\n    git:\n      url: https://github.com/a/b.git';
    const s = detector.detect(PUBSPEC, content).find(x => x.type === 'git-dependency');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('dependency-confusion');
  });

  it('flags a path dependency as medium', () => {
    const content = 'dependencies:\n  local:\n    path: ../local_pkg';
    const s = detector.detect(PUBSPEC, content).find(x => x.type === 'path-dependency');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
  });

  it('emits one signal per git dependency', () => {
    const content = 'dependencies:\n  a:\n    git:\n      url: x\n  b:\n    git:\n      url: y';
    const signals = detector.detect(PUBSPEC, content).filter(x => x.type === 'git-dependency');
    expect(signals).toHaveLength(2);
  });

  it('returns nothing for a pub.dev-only pubspec', () => {
    expect(detector.detect(PUBSPEC, 'name: demo\ndependencies:\n  http: ^1.0.0')).toEqual([]);
  });

  it('detects git and path dependencies together', () => {
    const content = 'dependencies:\n  a:\n    git:\n      url: x\n  b:\n    path: ../b';
    const types = detector.detect(PUBSPEC, content).map(s => s.type);
    expect(types).toContain('git-dependency');
    expect(types).toContain('path-dependency');
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(PUBSPEC, 'executables:\n  x: y');
    expect(signals[0].file).toBe(PUBSPEC);
    expect(signals[0].language).toBe('dart');
  });
});
