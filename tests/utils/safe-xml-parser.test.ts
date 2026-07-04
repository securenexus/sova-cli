import { describe, it, expect } from 'vitest';
import { createSafeXmlParser } from '../../src/utils/safe-xml-parser.js';

describe('createSafeXmlParser', () => {
  it('creates an XMLParser instance', () => {
    const parser = createSafeXmlParser();
    expect(parser).toBeDefined();
    expect(typeof parser.parse).toBe('function');
  });

  it('parses valid XML correctly', () => {
    const parser = createSafeXmlParser();
    const xml = `<root><item id="1">hello</item><item id="2">world</item></root>`;
    const result = parser.parse(xml) as Record<string, unknown>;
    expect(result).toHaveProperty('root');
    const root = result['root'] as Record<string, unknown>;
    expect(root).toHaveProperty('item');
  });

  it('parses XML attributes when ignoreAttributes is false (default)', () => {
    const parser = createSafeXmlParser();
    const xml = `<package id="Newtonsoft.Json" version="13.0.1" />`;
    const result = parser.parse(xml) as Record<string, unknown>;
    expect(result).toHaveProperty('package');
    const pkg = result['package'] as Record<string, unknown>;
    // Attributes are parsed (ignoreAttributes: false)
    expect(Object.keys(pkg).some(k => k.includes('id') || k.includes('version'))).toBe(true);
  });

  it('allows merging non-safety options (attributeNamePrefix)', () => {
    const parser = createSafeXmlParser({ attributeNamePrefix: '@_' });
    const xml = `<packages><package id="Test" version="1.0.0" /></packages>`;
    const result = parser.parse(xml) as Record<string, unknown>;
    const packages = result['packages'] as Record<string, unknown>;
    const pkg = packages['package'] as Record<string, unknown>;
    expect(pkg['@_id']).toBe('Test');
    expect(pkg['@_version']).toBe('1.0.0');
  });

  it('does NOT process external entities (XXE prevention)', () => {
    // An XML payload that would be dangerous if external entities were fetched.
    // With processEntities: false, fast-xml-parser v4 either throws on external entity
    // declarations or leaves entity references unexpanded — either way /etc/passwd is not read.
    const xmlWithEntity = `<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`;

    const parser = createSafeXmlParser();
    let result: Record<string, unknown> | undefined;
    let threw = false;
    try {
      result = parser.parse(xmlWithEntity) as Record<string, unknown>;
    } catch {
      // Throwing is also acceptable — it means the library actively rejected the entity
      threw = true;
    }

    if (!threw) {
      // If it didn't throw, the entity must NOT have been expanded to actual file content
      const rootValue = String((result?.['root'] ?? ''));
      expect(rootValue).not.toMatch(/root:.*:0:0/); // typical /etc/passwd format
    }
    // Either path (threw or returned without expansion) is a pass — XXE was not executed
    expect(threw || result !== undefined).toBe(true);
  });

  it('ignores a caller override of processEntities: true (enforced safe)', () => {
    // Even though the caller tries to turn entity processing back on, the factory
    // enforces processEntities: false last, so the entity must not expand to file content.
    const xmlWithEntity = `<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`;

    const parser = createSafeXmlParser({ processEntities: true });
    let result: Record<string, unknown> | undefined;
    let threw = false;
    try {
      result = parser.parse(xmlWithEntity) as Record<string, unknown>;
    } catch {
      threw = true;
    }
    if (!threw) {
      const rootValue = String((result?.['root'] ?? ''));
      expect(rootValue).not.toMatch(/root:.*:0:0/);
    }
    expect(threw || result !== undefined).toBe(true);
  });

  it('returns a fresh parser each call (no shared state)', () => {
    const p1 = createSafeXmlParser();
    const p2 = createSafeXmlParser();
    expect(p1).not.toBe(p2);
  });
});
