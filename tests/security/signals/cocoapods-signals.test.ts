import { describe, it, expect } from 'vitest';
import { CocoapodsSignals } from '../../../src/security/signals/cocoapods-signals.js';

const detector = new CocoapodsSignals();
const PODSPEC = '/project/Demo.podspec';
const PODFILE = '/project/Podfile';

describe('CocoapodsSignals', () => {
  it('language property is "cocoa"', () => {
    expect(detector.language).toBe('cocoa');
  });

  it('returns no signals for an unrelated file', () => {
    expect(detector.detect('/project/main.swift', 'prepare_command')).toEqual([]);
  });

  describe('podspec', () => {
    it('flags script_phases as critical', () => {
      const s = detector.detect(PODSPEC, "s.script_phases = [{ :script => 'curl x | sh' }]")
        .find(x => x.type === 'podspec-script-phase');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
    });

    it('flags the singular .script_phase form too', () => {
      const signals = detector.detect(PODSPEC, "s.script_phase = { :name => 'x' }");
      expect(signals.some(x => x.type === 'podspec-script-phase')).toBe(true);
    });

    it('flags prepare_command as critical', () => {
      const s = detector.detect(PODSPEC, "s.prepare_command = 'ruby build.rb'")
        .find(x => x.type === 'podspec-prepare-command');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
    });

    it('handles a .podspec.json file', () => {
      const signals = detector.detect('/project/Demo.podspec.json', '"prepare_command": "x"');
      expect(Array.isArray(signals)).toBe(true);
    });

    it('returns nothing for a benign podspec', () => {
      expect(detector.detect(PODSPEC, "s.name = 'Demo'\ns.version = '1.0'")).toEqual([]);
    });
  });

  describe('Podfile', () => {
    it('flags a git-sourced pod as high', () => {
      const s = detector.detect(PODFILE, "pod 'X', :git => 'https://github.com/a/b.git'")
        .find(x => x.type === 'git-pod-source');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
      expect(s!.category).toBe('dependency-confusion');
      expect(s!.content).toBe('https://github.com/a/b.git');
    });

    it('emits one signal per git-sourced pod', () => {
      const content = "pod 'A', :git => 'https://x/a.git'\npod 'B', :git => 'https://x/b.git'";
      expect(detector.detect(PODFILE, content)).toHaveLength(2);
    });

    it('returns nothing for a trunk-only Podfile', () => {
      expect(detector.detect(PODFILE, "pod 'Alamofire', '~> 5.0'")).toEqual([]);
    });

    it('also inspects Podfile.lock', () => {
      const signals = detector.detect('/project/Podfile.lock', ":git => 'https://x/a.git'");
      expect(signals.some(x => x.type === 'git-pod-source')).toBe(true);
    });
  });
});
