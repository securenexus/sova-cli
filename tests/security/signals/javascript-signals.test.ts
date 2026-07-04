import { describe, it, expect } from 'vitest';
import { JavaScriptSignals } from '../../../src/security/signals/javascript-signals.js';

const detector = new JavaScriptSignals();
const FILE = '/project/package.json';

function makePackageJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'test-pkg',
    version: '1.0.0',
    author: 'Alice',
    repository: 'https://github.com/alice/test-pkg',
    ...overrides,
  });
}

describe('JavaScriptSignals', () => {
  it('language property is "javascript"', () => {
    expect(detector.language).toBe('javascript');
  });

  it('returns empty array for non-package.json files with no source patterns', () => {
    const signals = detector.detect('/project/yarn.lock', 'some content');
    expect(signals).toHaveLength(0);
  });

  it('returns empty array for invalid JSON', () => {
    const signals = detector.detect(FILE, 'not valid json {{{');
    expect(signals).toHaveLength(0);
  });

  it('detects postinstall lifecycle script', () => {
    const content = makePackageJson({ scripts: { postinstall: 'node ./setup.js' } });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'postinstall-script')).toBe(true);
    expect(signals.find(s => s.type === 'postinstall-script')!.severity).toBe('critical');
    expect(signals.find(s => s.type === 'postinstall-script')!.category).toBe('install-script');
  });

  it('detects preinstall lifecycle script', () => {
    const content = makePackageJson({ scripts: { preinstall: 'echo pre' } });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'preinstall-script')).toBe(true);
  });

  it('detects install lifecycle script', () => {
    const content = makePackageJson({ scripts: { install: 'make build' } });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'install-script')).toBe(true);
  });

  it('detects prepare script', () => {
    const content = makePackageJson({ scripts: { prepare: 'npm run build' } });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'prepare-script')).toBe(true);
    expect(signals.find(s => s.type === 'prepare-script')!.severity).toBe('high');
  });

  it('also scans postinstall script for obfuscation signals', () => {
    const content = makePackageJson({
      scripts: { postinstall: "eval(Buffer.from('abc','base64'))" },
    });
    const signals = detector.detect(FILE, content);
    // postinstall-script signal + eval-usage + base64-encoding
    expect(signals.some(s => s.type === 'postinstall-script')).toBe(true);
    expect(signals.some(s => s.type === 'eval-usage')).toBe(true);
    expect(signals.some(s => s.type === 'base64-encoding')).toBe(true);
  });

  it('detects native addon (node-gyp reference)', () => {
    const content = makePackageJson({ scripts: { build: 'node-gyp rebuild' } });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'native-addon')).toBe(true);
    expect(signals.find(s => s.type === 'native-addon')!.severity).toBe('high');
    expect(signals.find(s => s.type === 'native-addon')!.category).toBe('native-code');
  });

  it('detects native addon (napi reference)', () => {
    const content = makePackageJson({ gypfile: true, _where: 'napi-addon' });
    const raw = JSON.stringify({ name: 'pkg', napi: {} });
    const signals = detector.detect(FILE, raw);
    expect(signals.some(s => s.type === 'native-addon')).toBe(true);
  });

  it('detects git URL dependency in dependencies', () => {
    const content = makePackageJson({
      dependencies: { 'my-lib': 'git+https://github.com/org/private-lib' },
    });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'git-url-dependency')).toBe(true);
    expect(signals.find(s => s.type === 'git-url-dependency')!.severity).toBe('high');
  });

  it('detects direct URL dependency', () => {
    const content = makePackageJson({
      dependencies: { 'my-lib': 'https://example.com/package.tgz' },
    });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'url-dependency')).toBe(true);
  });

  it('detects wildcard version in dependencies', () => {
    const content = makePackageJson({
      dependencies: { express: '*' },
    });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'wildcard-version')).toBe(true);
    expect(signals.find(s => s.type === 'wildcard-version')!.severity).toBe('medium');
  });

  it('detects wildcard version in devDependencies', () => {
    const content = makePackageJson({
      devDependencies: { jest: 'latest' },
    });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'wildcard-version')).toBe(true);
  });

  it('detects missing author metadata', () => {
    const content = JSON.stringify({
      name: 'anon-pkg',
      version: '1.0.0',
    });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'missing-author')).toBe(true);
    expect(signals.some(s => s.type === 'missing-repository')).toBe(true);
  });

  it('returns no signals for clean well-formed package.json', () => {
    const content = makePackageJson({
      dependencies: { express: '^4.18.0', lodash: '4.17.21' },
    });
    const signals = detector.detect(FILE, content);
    expect(signals).toHaveLength(0);
  });

  it('scans peerDependencies and optionalDependencies', () => {
    const content = makePackageJson({
      peerDependencies: { react: '*' },
      optionalDependencies: { 'optional-pkg': 'git@github.com:org/pkg' },
    });
    const signals = detector.detect(FILE, content);
    expect(signals.some(s => s.type === 'wildcard-version')).toBe(true);
    expect(signals.some(s => s.type === 'git-url-dependency')).toBe(true);
  });

  // Source pattern detection tests
  describe('source pattern detection', () => {
    const SRC = '/project/src/index.js';

    it('detects eval() call in source files', () => {
      const signals = detector.detect(SRC, 'eval(userInput)');
      expect(signals.some(s => s.type === 'eval-call')).toBe(true);
      expect(signals.find(s => s.type === 'eval-call')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'eval-call')!.category).toBe('code-injection');
    });

    it('detects new Function() constructor in source files', () => {
      const signals = detector.detect(SRC, 'const fn = new Function("return 1 + 1")');
      expect(signals.some(s => s.type === 'function-constructor')).toBe(true);
      expect(signals.find(s => s.type === 'function-constructor')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'function-constructor')!.category).toBe('code-injection');
    });

    it('detects XMLParser default config (no options)', () => {
      const signals = detector.detect(SRC, 'const parser = new XMLParser()');
      expect(signals.some(s => s.type === 'xml-default-config')).toBe(true);
      expect(signals.find(s => s.type === 'xml-default-config')!.severity).toBe('high');
      expect(signals.find(s => s.type === 'xml-default-config')!.category).toBe('unsafe-deserialization');
    });

    it('does not flag XMLParser when options are provided', () => {
      const signals = detector.detect(SRC, 'const parser = new XMLParser({ ignoreAttributes: false })');
      expect(signals.some(s => s.type === 'xml-default-config')).toBe(false);
    });

    it('detects extractAllTo() zip extraction', () => {
      const signals = detector.detect(SRC, 'zip.extractAllTo("/tmp/output", true)');
      expect(signals.some(s => s.type === 'zip-extract')).toBe(true);
      expect(signals.find(s => s.type === 'zip-extract')!.severity).toBe('high');
      expect(signals.find(s => s.type === 'zip-extract')!.category).toBe('unsafe-archive-extraction');
    });

    it('detects extractEntryTo() zip extraction', () => {
      const signals = detector.detect(SRC, 'zip.extractEntryTo(entry, "/tmp/out")');
      expect(signals.some(s => s.type === 'zip-extract')).toBe(true);
    });

    it('returns no signals for clean source file', () => {
      const signals = detector.detect(SRC, 'const x = 1 + 2;\nconsole.log(x);');
      expect(signals).toHaveLength(0);
    });

    it('also detects source patterns in package.json files', () => {
      // A package.json that happens to embed eval in a script
      const content = makePackageJson({ scripts: { test: 'node -e "eval(\'1\')"' } });
      const signals = detector.detect(FILE, content);
      // Should have install-related signals AND source-pattern eval-call
      expect(signals.some(s => s.type === 'eval-call')).toBe(true);
    });
  });
});
