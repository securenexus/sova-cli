import { describe, it, expect } from 'vitest';
import { SwiftSignals } from '../../../src/security/signals/swift-signals.js';

const detector = new SwiftSignals();
const PKG = '/project/Package.swift';

describe('SwiftSignals', () => {
  it('language property is "swift"', () => {
    expect(detector.language).toBe('swift');
  });

  it('ignores files other than Package.swift', () => {
    expect(detector.detect('/project/Sources/main.swift', 'unsafeFlags(["-Ounchecked"])')).toEqual([]);
  });

  it('flags a build plugin as high', () => {
    const s = detector.detect(PKG, '.plugin(name: "Gen", capability: .buildTool())')
      .find(x => x.type === 'build-plugin');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('flags unsafeFlags as high native-code', () => {
    const s = detector.detect(PKG, '.unsafeFlags(["-Ounchecked", "-w"])')
      .find(x => x.type === 'unsafe-flags');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('native-code');
  });

  it('flags a systemLibrary target as medium', () => {
    const s = detector.detect(PKG, '.systemLibrary(name: "CSSL", pkgConfig: "openssl")')
      .find(x => x.type === 'system-library');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
    expect(s!.category).toBe('native-code');
  });

  it('emits one signal per unsafeFlags occurrence', () => {
    const content = '.unsafeFlags(["-a"])\n.unsafeFlags(["-b"])';
    const signals = detector.detect(PKG, content).filter(x => x.type === 'unsafe-flags');
    expect(signals).toHaveLength(2);
  });

  it('returns nothing for a plain Package.swift', () => {
    const content = 'let package = Package(name: "Demo", targets: [.target(name: "Demo")])';
    expect(detector.detect(PKG, content)).toEqual([]);
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(PKG, '.unsafeFlags(["-a"])');
    expect(signals[0].file).toBe(PKG);
    expect(signals[0].language).toBe('swift');
  });
});
