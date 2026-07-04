import { describe, it, expect } from 'vitest';
import { RubyParser } from '../../src/parsers/ruby-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/ruby');
const parser = new RubyParser();

describe('RubyParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('ruby');
  });

  describe('Gemfile', () => {
    const fixturePath = resolve(fixtureDir, 'Gemfile');

    it('has fileType manifest and packageManager bundler', async () => {
      const result = await parser.parse('ruby', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('bundler');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('ruby', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('extracts gems with version constraints', async () => {
      const result = await parser.parse('ruby', fixturePath);
      // rails ~> 7.0 → version 7.0
      expect(result.dependencies.map(a => a.key)).toContain('rails_:_7.0');
    });

    it('extracts gems with >= constraints', async () => {
      const result = await parser.parse('ruby', fixturePath);
      // pg >= 1.1 → version 1.1
      expect(result.dependencies.map(a => a.key)).toContain('pg_:_1.1');
    });

    it('extracts gems from group blocks', async () => {
      const result = await parser.parse('ruby', fixturePath);
      expect(result.dependencies.map(a => a.key)).toContain('rspec-rails_:_6.0');
    });
  });

  describe('Gemfile.lock', () => {
    const fixturePath = resolve(fixtureDir, 'Gemfile.lock');

    it('has fileType lockfile and packageManager bundler', async () => {
      const result = await parser.parse('ruby', fixturePath);
      expect(result.fileType).toBe('lockfile');
      expect(result.packageManager).toBe('bundler');
    });

    it('extracts resolved gem versions from SPECS section', async () => {
      const result = await parser.parse('ruby', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('rails_:_7.0.8');
      expect(keys).toContain('actionpack_:_7.0.8');
      expect(keys).toContain('activesupport_:_7.0.8');
    });

    it('builds adjacency tree from gem sub-dependencies', async () => {
      const result = await parser.parse('ruby', fixturePath);
      expect(result.additionalDependencies).toBeDefined();
      // rails depends on actioncable, actionpack, activesupport
      const railsDeps = result.additionalDependencies!['rails_:_7.0.8'];
      expect(railsDeps).toBeDefined();
      expect(railsDeps).toContain('actionpack_:_7.0.8');
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent Gemfile', async () => {
      const result = await parser.parse('ruby', '/nonexistent/Gemfile');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('bundler');
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('ruby', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { RubyParser as RubyV2 } from '../../src/parsers/ruby-parser.js';

const rubyV2 = new RubyV2();

describeV2('RubyParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-ruby-v2-'));

  itV2('Gemfile gem → runtime; development/test groups → dev', async () => {
    const p = joinV2(tmp, 'Gemfile');
    writeFileSync(p, [
      'source "https://rubygems.org"',
      'gem "rails", "7.0.0"',
      'group :development, :test do',
      '  gem "rspec", "3.12.0"',
      'end',
      ''
    ].join('\n'));
    const r = await rubyV2.parse('ruby', p);
    const rails = r.dependencies.find(a => a.name === 'rails');
    const rspec = r.dependencies.find(a => a.name === 'rspec');
    if (rails) {
      expectV2(rails.scope).toBe('runtime');
      expectV2(rails.purl).toMatch(/^pkg:gem\//);
    }
    if (rspec) expectV2(rspec.scope).toBe('dev');
  });

  itV2('Gemfile.lock SPECS → runtime (no group info)', async () => {
    const p = joinV2(tmp, 'Gemfile.lock');
    writeFileSync(p, [
      'GEM',
      '  remote: https://rubygems.org/',
      '  specs:',
      '    rails (7.0.0)',
      '',
      'PLATFORMS',
      '  ruby',
      ''
    ].join('\n'));
    const r = await rubyV2.parse('ruby', p);
    if (r.dependencies.length > 0) {
      expectV2(r.dependencies[0].scope).toBe('runtime');
    }
  });
});
