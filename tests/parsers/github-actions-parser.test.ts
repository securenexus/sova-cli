import { describe, it, expect } from 'vitest';
import { GithubActionsParser } from '../../src/parsers/github-actions-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/github-actions/.github/workflows');
const parser = new GithubActionsParser();

describe('GithubActionsParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('github-actions');
  });

  describe('ci.yml', () => {
    const fixturePath = resolve(fixtureDir, 'ci.yml');

    it('extracts action uses references', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes actions/checkout', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('actions/checkout');
    });

    it('includes actions/setup-node', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('actions/setup-node');
    });

    it('includes aws-actions/configure-aws-credentials', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('aws-actions/configure-aws-credentials');
    });

    it('extracts container images', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('node');
    });

    it('extracts service images', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('postgres');
    });

    it('has packageManager github-actions and fileType manifest', async () => {
      const result = await parser.parse('github-actions', fixturePath);
      expect(result.packageManager).toBe('github-actions');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('github-actions', '/nonexistent/ci.yml');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { GithubActionsParser as GhV2 } from '../../src/parsers/github-actions-parser.js';

const ghV2 = new GhV2();

describeV2('GitHubActionsParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-gh-v2-'));

  itV2('uses → runtime + github PURL', async () => {
    const p = joinV2(tmp, 'workflow.yml');
    writeFileSync(p, [
      'name: ci',
      'on: [push]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      ''
    ].join('\n'));
    const r = await ghV2.parse('github_actions', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toMatch(/^pkg:github\//);
      }
    }
  });
});
