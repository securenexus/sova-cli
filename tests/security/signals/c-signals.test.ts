import { describe, it, expect } from 'vitest';
import { CSignals } from '../../../src/security/signals/c-signals.js';

const detector = new CSignals();
const CMAKE = '/project/CMakeLists.txt';
const CONAN = '/project/conanfile.py';

describe('CSignals', () => {
  it('language property is "c"', () => {
    expect(detector.language).toBe('c');
  });

  it('returns no signals for an unrelated file name', () => {
    expect(detector.detect('/project/main.c', 'execute_process(ls)')).toEqual([]);
  });

  describe('CMakeLists.txt', () => {
    it('flags execute_process() as critical', () => {
      const signals = detector.detect(CMAKE, 'execute_process(COMMAND curl http://x)');
      const s = signals.find(x => x.type === 'cmake-execute-process');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
      expect(s!.content).toContain('execute_process');
    });

    it('flags ExternalProject_Add() as critical dependency-confusion', () => {
      const s = detector.detect(CMAKE, 'ExternalProject_Add(foo URL http://x)')
        .find(x => x.type === 'cmake-external-project');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('dependency-confusion');
    });

    it('flags FetchContent_Declare() as high', () => {
      const s = detector.detect(CMAKE, 'FetchContent_Declare(dep GIT_REPOSITORY http://x)')
        .find(x => x.type === 'cmake-fetch-content');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
    });

    it('returns nothing for a benign CMakeLists.txt', () => {
      expect(detector.detect(CMAKE, 'project(demo)\nadd_executable(demo main.c)')).toEqual([]);
    });

    it('detects several CMake signals in one file', () => {
      const signals = detector.detect(CMAKE, 'execute_process(COMMAND x)\nExternalProject_Add(y)\nFetchContent_Declare(z)');
      expect(signals).toHaveLength(3);
    });

    it('does not apply conan rules to CMakeLists.txt', () => {
      const signals = detector.detect(CMAKE, 'def build(self): pass');
      expect(signals).toEqual([]);
    });
  });

  describe('conanfile.py', () => {
    it('flags a custom build() method as high', () => {
      const s = detector.detect(CONAN, 'class P:\n    def build(self):\n        self.run("make")')
        .find(x => x.type === 'conan-custom-build');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
      expect(s!.category).toBe('install-script');
    });

    it('flags a custom source() method as high', () => {
      const s = detector.detect(CONAN, 'class P:\n    def source(self):\n        tools.download("http://x")')
        .find(x => x.type === 'conan-custom-source');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
    });

    it('returns nothing for a conanfile with no build or source hooks', () => {
      expect(detector.detect(CONAN, 'class P:\n    name = "demo"')).toEqual([]);
    });

    it('records the file and language on each signal', () => {
      const signals = detector.detect(CONAN, 'def build(self): pass');
      expect(signals[0].file).toBe(CONAN);
      expect(signals[0].language).toBe('c');
    });
  });
});
