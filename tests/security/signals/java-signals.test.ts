import { describe, it, expect } from 'vitest';
import { JavaSignals } from '../../../src/security/signals/java-signals.js';

const detector = new JavaSignals();
const SRC = '/project/src/main/java/App.java';

describe('JavaSignals', () => {
  it('language property is "java"', () => {
    expect(detector.language).toBe('java');
  });

  // Existing manifest detection still works
  it('detects exec-maven-plugin in pom.xml', () => {
    const signals = detector.detect('/project/pom.xml', '<plugin><artifactId>exec-maven-plugin</artifactId></plugin>');
    expect(signals.some(s => s.type === 'exec-maven-plugin')).toBe(true);
  });

  it('detects gradle-exec-task in build.gradle', () => {
    const signals = detector.detect('/project/build.gradle', 'task myTask(type: Exec) { commandLine "ls" }');
    expect(signals.some(s => s.type === 'gradle-exec-task')).toBe(true);
  });

  // Source pattern: unsafe-deserialization
  describe('unsafe-deserialization', () => {
    it('detects ObjectInputStream usage', () => {
      const signals = detector.detect(SRC, 'ObjectInputStream ois = new ObjectInputStream(fis);');
      expect(signals.some(s => s.type === 'java-deserialization')).toBe(true);
      expect(signals.find(s => s.type === 'java-deserialization')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'java-deserialization')!.category).toBe('unsafe-deserialization');
    });

    it('detects readObject() call', () => {
      const signals = detector.detect(SRC, 'Object obj = ois.readObject();');
      expect(signals.some(s => s.type === 'java-deserialization')).toBe(true);
    });
  });

  // Source pattern: code-injection
  describe('code-injection', () => {
    it('detects Runtime.getRuntime().exec()', () => {
      const signals = detector.detect(SRC, 'Runtime.getRuntime().exec(userInput)');
      expect(signals.some(s => s.type === 'runtime-exec')).toBe(true);
      expect(signals.find(s => s.type === 'runtime-exec')!.severity).toBe('high');
      expect(signals.find(s => s.type === 'runtime-exec')!.category).toBe('code-injection');
    });
  });

  it('returns no source signals for clean Java code', () => {
    const clean = `
public class App {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`;
    const signals = detector.detect(SRC, clean);
    expect(signals).toHaveLength(0);
  });

  it('scans source patterns on non-build-file Java files', () => {
    const signals = detector.detect('/project/src/Util.java', 'new ObjectInputStream(stream)');
    expect(signals.some(s => s.type === 'java-deserialization')).toBe(true);
  });
});
