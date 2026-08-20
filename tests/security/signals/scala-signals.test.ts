import { describe, it, expect } from 'vitest';
import { ScalaSignals } from '../../../src/security/signals/scala-signals.js';

const detector = new ScalaSignals();
const SBT = '/project/build.sbt';

describe('ScalaSignals', () => {
  it('language property is "scala"', () => {
    expect(detector.language).toBe('scala');
  });

  it('ignores files other than build.sbt', () => {
    expect(detector.detect('/project/src/Main.scala', 'addCompilerPlugin("x")')).toEqual([]);
  });

  it('flags a compiler plugin as high', () => {
    const s = detector.detect(SBT, 'addCompilerPlugin("org.x" %% "plugin" % "1.0")')
      .find(x => x.type === 'compiler-plugin');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('install-script');
  });

  it('flags a custom TaskKey as medium', () => {
    const s = detector.detect(SBT, 'val deploy = TaskKey[Unit]("deploy")')
      .find(x => x.type === 'custom-task-key');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('medium');
  });

  it('flags a non-standard resolver as high', () => {
    const s = detector.detect(SBT, 'resolvers += "Internal" at "https://nexus.internal/repo"')
      .find(x => x.type === 'non-standard-resolver');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('dependency-confusion');
  });

  it('does not flag a Maven Central resolver', () => {
    const signals = detector.detect(SBT, 'resolvers += "central" at "https://repo1.maven.org/maven2"');
    expect(signals.some(x => x.type === 'non-standard-resolver')).toBe(false);
  });

  it('does not flag a Sonatype resolver', () => {
    const signals = detector.detect(SBT, 'resolvers += "snap" at "https://oss.sonatype.org/content/repositories/snapshots"');
    expect(signals.some(x => x.type === 'non-standard-resolver')).toBe(false);
  });

  it('emits one signal per compiler plugin', () => {
    const content = 'addCompilerPlugin("a" % "b" % "1")\naddCompilerPlugin("c" % "d" % "2")';
    const signals = detector.detect(SBT, content).filter(x => x.type === 'compiler-plugin');
    expect(signals).toHaveLength(2);
  });

  it('returns nothing for a plain build.sbt', () => {
    expect(detector.detect(SBT, 'name := "demo"\nscalaVersion := "3.3.1"')).toEqual([]);
  });

  it('records file and language on signals', () => {
    const signals = detector.detect(SBT, 'addCompilerPlugin("a" % "b" % "1")');
    expect(signals[0].file).toBe(SBT);
    expect(signals[0].language).toBe('scala');
  });
});
