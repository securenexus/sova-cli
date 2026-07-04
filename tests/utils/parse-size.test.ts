// tests/utils/parse-size.test.ts
import { describe, it, expect } from 'vitest';
import { parseSize, formatSize } from '../../src/utils/parse-size.js';

describe('parseSize', () => {
  it('parses KB values', () => {
    expect(parseSize('500KB')).toBe(500 * 1024);
  });

  it('parses MB values', () => {
    expect(parseSize('50MB')).toBe(50 * 1024 * 1024);
  });

  it('parses GB values', () => {
    expect(parseSize('1GB')).toBe(1024 * 1024 * 1024);
  });

  it('parses lowercase', () => {
    expect(parseSize('50mb')).toBe(50 * 1024 * 1024);
  });

  it('parses plain number as bytes', () => {
    expect(parseSize('1024')).toBe(1024);
  });

  it('parses numeric input as bytes', () => {
    expect(parseSize(1024 as any)).toBe(1024);
  });

  it('throws on invalid format', () => {
    expect(() => parseSize('abc')).toThrow('Invalid size format');
  });

  it('formats bytes to human-readable string', () => {
    expect(formatSize(50 * 1024 * 1024)).toBe('50.0 MB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(500)).toBe('500 B');
  });
});
