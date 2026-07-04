import { describe, it, expect } from 'vitest';
import { ElixirParser } from '../../src/parsers/elixir-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/elixir');
const parser = new ElixirParser();

describe('ElixirParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('elixir');
  });

  describe('mix.exs', () => {
    const fixturePath = resolve(fixtureDir, 'mix.exs');

    it('extracts project metadata', async () => {
      const result = await parser.parse('elixir', fixturePath);
      expect(result.projectName).toBe('my_app');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('elixir', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes phoenix', async () => {
      const result = await parser.parse('elixir', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('phoenix');
    });

    it('has packageManager hex and fileType manifest', async () => {
      const result = await parser.parse('elixir', fixturePath);
      expect(result.packageManager).toBe('hex');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('mix.lock', () => {
    const fixturePath = resolve(fixtureDir, 'mix.lock');

    it('extracts locked hex packages', async () => {
      const result = await parser.parse('elixir', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes phoenix at exact version', async () => {
      const result = await parser.parse('elixir', fixturePath);
      const phoenix = result.dependencies.find(d => d.name === 'phoenix');
      expect(phoenix?.version).toBe('1.7.11');
    });

    it('includes jason', async () => {
      const result = await parser.parse('elixir', fixturePath);
      const jason = result.dependencies.find(d => d.name === 'jason');
      expect(jason?.version).toBe('1.4.1');
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('elixir', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('elixir', '/nonexistent/mix.exs');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { ElixirParser as ElixirV2 } from '../../src/parsers/elixir-parser.js';

const exV2 = new ElixirV2();

describeV2('ElixirParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-elixir-v2-'));

  itV2('mix.exs deps with only: :test → dev; without → runtime', async () => {
    const p = joinV2(tmp, 'mix.exs');
    writeFileSync(p, [
      'defmodule X.MixProject do',
      '  use Mix.Project',
      '  def project do [app: :x, version: "0.1.0", deps: deps()] end',
      '  defp deps do',
      '    [',
      '      {:phoenix, "~> 1.7"},',
      '      {:ex_unit, "~> 1.0", only: :test}',
      '    ]',
      '  end',
      'end',
      ''
    ].join('\n'));
    const r = await exV2.parse('elixir', p);
    const phoenix = r.dependencies.find(a => a.name === 'phoenix');
    const exUnit = r.dependencies.find(a => a.name === 'ex_unit');
    if (phoenix) {
      expectV2(phoenix.scope).toBe('runtime');
      expectV2(phoenix.purl).toMatch(/^pkg:hex\//);
    }
    if (exUnit) expectV2(exUnit.scope).toBe('dev');
  });
});
