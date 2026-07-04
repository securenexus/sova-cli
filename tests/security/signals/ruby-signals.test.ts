import { describe, it, expect } from 'vitest';
import { RubySignals } from '../../../src/security/signals/ruby-signals.js';

const detector = new RubySignals();
const SRC = '/project/lib/app.rb';

describe('RubySignals', () => {
  it('language property is "ruby"', () => {
    expect(detector.language).toBe('ruby');
  });

  // Existing manifest detection still works
  it('detects native extensions in .gemspec', () => {
    const signals = detector.detect('/project/mygem.gemspec', 'spec.extensions = ["ext/extconf.rb"]');
    expect(signals.some(s => s.type === 'gem-extensions')).toBe(true);
  });

  it('detects git source in Gemfile', () => {
    const signals = detector.detect('/project/Gemfile', "gem 'my_gem', git: 'https://github.com/org/repo'");
    expect(signals.some(s => s.type === 'gemfile-git-source')).toBe(true);
  });

  // Source pattern: unsafe-deserialization
  describe('unsafe-deserialization', () => {
    it('detects YAML.load without safe_load', () => {
      const signals = detector.detect(SRC, 'data = YAML.load(input)');
      expect(signals.some(s => s.type === 'yaml-unsafe-load')).toBe(true);
      expect(signals.find(s => s.type === 'yaml-unsafe-load')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'yaml-unsafe-load')!.category).toBe('unsafe-deserialization');
    });

    it('does not flag YAML.safe_load', () => {
      const signals = detector.detect(SRC, 'data = YAML.safe_load(input)');
      expect(signals.some(s => s.type === 'yaml-unsafe-load')).toBe(false);
    });

    it('detects Marshal.load', () => {
      const signals = detector.detect(SRC, 'obj = Marshal.load(data)');
      expect(signals.some(s => s.type === 'marshal-load')).toBe(true);
      expect(signals.find(s => s.type === 'marshal-load')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'marshal-load')!.category).toBe('unsafe-deserialization');
    });
  });

  // Source pattern: code-injection
  describe('code-injection', () => {
    it('detects eval() call', () => {
      const signals = detector.detect(SRC, 'eval(user_code)');
      expect(signals.some(s => s.type === 'eval-call')).toBe(true);
      expect(signals.find(s => s.type === 'eval-call')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'eval-call')!.category).toBe('code-injection');
    });

    it('detects system() call', () => {
      const signals = detector.detect(SRC, 'system("ls #{user_dir}")');
      expect(signals.some(s => s.type === 'system-call')).toBe(true);
      expect(signals.find(s => s.type === 'system-call')!.severity).toBe('high');
      expect(signals.find(s => s.type === 'system-call')!.category).toBe('code-injection');
    });
  });

  it('returns no source signals for clean Ruby code', () => {
    const clean = `
require 'json'

def load_config(path)
  JSON.parse(File.read(path))
end
`;
    const signals = detector.detect(SRC, clean);
    expect(signals).toHaveLength(0);
  });

  it('scans source patterns on arbitrary .rb files', () => {
    const signals = detector.detect('/project/helpers/util.rb', 'Marshal.load(blob)');
    expect(signals.some(s => s.type === 'marshal-load')).toBe(true);
  });
});
