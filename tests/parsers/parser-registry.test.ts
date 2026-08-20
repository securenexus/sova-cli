import { describe, it, expect } from 'vitest';
import { getParser, getSupportedLanguages } from '../../src/parsers/parser-registry.js';

describe('getSupportedLanguages', () => {
  it('returns a non-empty list of languages', () => {
    const langs = getSupportedLanguages();
    expect(Array.isArray(langs)).toBe(true);
    expect(langs.length).toBeGreaterThan(20);
  });

  it('includes the core ecosystems', () => {
    const langs = getSupportedLanguages();
    for (const lang of ['javascript', 'python', 'java', 'rust', 'go', 'ruby', 'php']) {
      expect(langs).toContain(lang);
    }
  });

  it('has no duplicate entries', () => {
    const langs = getSupportedLanguages();
    expect(new Set(langs).size).toBe(langs.length);
  });
});

describe('getParser', () => {
  it('loads a parser for every advertised language', async () => {
    for (const lang of getSupportedLanguages()) {
      const parser = await getParser(lang);
      expect(parser, `expected a parser for "${lang}"`).not.toBeNull();
      expect(typeof parser!.parse, `parse() missing on "${lang}" parser`).toBe('function');
    }
  });

  it('returns null for an unsupported language', async () => {
    expect(await getParser('cobol')).toBeNull();
  });

  it('returns null for an empty language string', async () => {
    expect(await getParser('')).toBeNull();
  });

  it('does not treat inherited Object properties as languages', async () => {
    expect(await getParser('constructor')).toBeNull();
    expect(await getParser('toString')).toBeNull();
  });

  it('caches the parser instance across calls', async () => {
    const first = await getParser('javascript');
    const second = await getParser('javascript');
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it('maps groovy and kotlin onto the Java parser', async () => {
    const groovy = await getParser('groovy');
    const kotlin = await getParser('kotlin');
    expect(groovy).not.toBeNull();
    expect(kotlin).not.toBeNull();
    expect(groovy!.constructor.name).toBe('JavaParser');
    expect(kotlin!.constructor.name).toBe('JavaParser');
  });

  it('returns distinct parser types for distinct ecosystems', async () => {
    const js = await getParser('javascript');
    const py = await getParser('python');
    expect(js!.constructor.name).not.toBe(py!.constructor.name);
  });
});
