import { describe, it, expect } from 'vitest';
import { detectHardcodedSecrets } from '../../../src/security/signals/base-signals.js';

const FILE = 'src/config.ts';
const LANG = 'javascript';

describe('detectHardcodedSecrets', () => {
  it('detects AWS access key (AKIA prefix + 16 uppercase alphanum)', () => {
    const content = 'const keyId = "AKIAIOSFODNN7EXAMPLE";';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'aws-access-key')).toBe(true);
    expect(signals.find(s => s.type === 'aws-access-key')!.severity).toBe('high');
    expect(signals.find(s => s.type === 'aws-access-key')!.category).toBe('hardcoded-secret');
  });

  it('detects RSA private key header', () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'private-key')).toBe(true);
    expect(signals.find(s => s.type === 'private-key')!.severity).toBe('high');
    expect(signals.find(s => s.type === 'private-key')!.category).toBe('hardcoded-secret');
  });

  it('detects generic private key header (no algorithm prefix)', () => {
    const content = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'private-key')).toBe(true);
  });

  it('detects EC private key header', () => {
    const content = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBkg...';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'private-key')).toBe(true);
  });

  it('detects API_KEY = ... hardcoded credential', () => {
    const content = 'const API_KEY = "supersecretvalue123";';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'hardcoded-credential')).toBe(true);
    expect(signals.find(s => s.type === 'hardcoded-credential')!.severity).toBe('high');
    expect(signals.find(s => s.type === 'hardcoded-credential')!.category).toBe('hardcoded-secret');
  });

  it('detects PASSWORD: ... hardcoded credential', () => {
    const content = 'PASSWORD: "mypassword123"';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'hardcoded-credential')).toBe(true);
  });

  it('detects TOKEN = ... hardcoded credential', () => {
    const content = "TOKEN = 'ghp_abcdefghijklmnop'";
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'hardcoded-credential')).toBe(true);
  });

  it('detects JWT token in source file', () => {
    const content = 'const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'jwt-token')).toBe(true);
    expect(signals.find(s => s.type === 'jwt-token')!.severity).toBe('high');
    expect(signals.find(s => s.type === 'jwt-token')!.category).toBe('hardcoded-secret');
  });

  it('returns empty array for safe content with no secrets', () => {
    const content = 'const x = process.env.API_KEY;\nconsole.log("hello world");';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals).toHaveLength(0);
  });

  it('returns empty array for short credential values (under 8 chars)', () => {
    const content = 'const SECRET = "short";';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.some(s => s.type === 'hardcoded-credential')).toBe(false);
  });

  it('sets correct file and language on signals', () => {
    const content = 'const API_KEY = "supersecretvalue123";';
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals[0].file).toBe(FILE);
    expect(signals[0].language).toBe(LANG);
  });

  it('can detect multiple secret types in one file', () => {
    const content = [
      'const API_KEY = "supersecretvalue123";',
      'const awsKey = "AKIAIOSFODNN7EXAMPLE";',
    ].join('\n');
    const signals = detectHardcodedSecrets(FILE, LANG, content);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals.some(s => s.type === 'aws-access-key')).toBe(true);
    expect(signals.some(s => s.type === 'hardcoded-credential')).toBe(true);
  });
});
