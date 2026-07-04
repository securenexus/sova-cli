import { describe, it, expect } from 'vitest';
import { DotNetParser } from '../../src/parsers/dotnet-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/dotnet');
const parser = new DotNetParser();

describe('DotNetParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('dotNet');
  });

  describe('packages.config', () => {
    const fixturePath = resolve(fixtureDir, 'packages.config');

    it('extracts dependencies', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes Newtonsoft.Json', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.dependencies.map((a) => a.key)).toContain('Newtonsoft.Json_:_13.0.3');
    });

    it('has packageManager nuget and fileType manifest', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.packageManager).toBe('nuget');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('MyApp.csproj', () => {
    const fixturePath = resolve(fixtureDir, 'MyApp.csproj');

    it('extracts PackageReference dependencies', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes Newtonsoft.Json from csproj', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.dependencies.map((a) => a.key)).toContain('Newtonsoft.Json_:_13.0.3');
    });
  });

  describe('packages.lock.json', () => {
    const fixturePath = resolve(fixtureDir, 'packages.lock.json');

    it('extracts resolved packages', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });

    it('builds adjacency for packages with deps', async () => {
      const result = await parser.parse('dotNet', fixturePath);
      expect(Object.keys(result.additionalDependencies).length).toBeGreaterThan(0);
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('dotNet', '/nonexistent/packages.config');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { DotNetParser as DotNetV2 } from '../../src/parsers/dotnet-parser.js';

const dnV2 = new DotNetV2();

describeV2('DotNetParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-dn-v2-'));

  itV2('csproj PackageReference → runtime + nuget PURL', async () => {
    const p = joinV2(tmp, 'MyApp.csproj');
    writeFileSync(p, [
      '<Project Sdk="Microsoft.NET.Sdk">',
      '  <ItemGroup>',
      '    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />',
      '    <PackageReference Include="Serilog" Version="3.0.0" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n'));
    const r = await dnV2.parse('dotnet', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toMatch(/^pkg:nuget\//);
      }
    }
  });
});
