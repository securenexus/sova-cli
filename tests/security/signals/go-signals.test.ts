import { describe, it, expect } from 'vitest';
import { GoSignals } from '../../../src/security/signals/go-signals.js';

const detector = new GoSignals();
const SRC = '/project/cmd/server/main.go';

describe('GoSignals', () => {
  it('language property is "go"', () => {
    expect(detector.language).toBe('go');
  });

  // Existing manifest detection still works
  it('detects replace directive in go.mod', () => {
    const signals = detector.detect('/project/go.mod', 'replace example.com/old => example.com/new v1.0.0');
    expect(signals.some(s => s.type === 'replace-different-repo')).toBe(true);
  });

  it('detects CGO import in .go files', () => {
    const signals = detector.detect('/project/native/native.go', 'import "C"');
    expect(signals.some(s => s.type === 'cgo-import')).toBe(true);
  });

  // Source pattern: code-injection
  describe('code-injection', () => {
    it('detects exec.Command() call', () => {
      const signals = detector.detect(SRC, 'cmd := exec.Command("sh", "-c", userInput)');
      expect(signals.some(s => s.type === 'exec-command')).toBe(true);
      expect(signals.find(s => s.type === 'exec-command')!.severity).toBe('high');
      expect(signals.find(s => s.type === 'exec-command')!.category).toBe('code-injection');
    });
  });

  // Source pattern: unbounded-resource
  describe('unbounded-resource', () => {
    it('detects io.ReadAll() without LimitReader', () => {
      const signals = detector.detect(SRC, 'data, err := io.ReadAll(r)');
      expect(signals.some(s => s.type === 'readall-unbounded')).toBe(true);
      expect(signals.find(s => s.type === 'readall-unbounded')!.severity).toBe('medium');
      expect(signals.find(s => s.type === 'readall-unbounded')!.category).toBe('unbounded-resource');
    });

    it('detects ioutil.ReadAll()', () => {
      const signals = detector.detect(SRC, 'data, err := ioutil.ReadAll(resp.Body)');
      expect(signals.some(s => s.type === 'readall-unbounded')).toBe(true);
    });
  });

  it('returns no source signals for clean Go code', () => {
    const clean = `
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`;
    const signals = detector.detect(SRC, clean);
    expect(signals).toHaveLength(0);
  });

  it('scans source patterns on non-go.mod files', () => {
    const signals = detector.detect('/project/internal/handler.go', 'exec.Command("ls")');
    expect(signals.some(s => s.type === 'exec-command')).toBe(true);
  });
});
