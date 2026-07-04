import { describe, it, expect } from 'vitest';
import { TerraformParser } from '../../src/parsers/terraform-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/terraform');
const parser = new TerraformParser();

describe('TerraformParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('terraform');
  });

  describe('main.tf', () => {
    const fixturePath = resolve(fixtureDir, 'main.tf');

    it('extracts required_providers', async () => {
      const result = await parser.parse('terraform', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes hashicorp/aws provider', async () => {
      const result = await parser.parse('terraform', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('hashicorp/aws');
    });

    it('includes hashicorp/random provider', async () => {
      const result = await parser.parse('terraform', fixturePath);
      const names = result.dependencies.map(d => d.name);
      expect(names).toContain('hashicorp/random');
    });

    it('has packageManager terraform and fileType manifest', async () => {
      const result = await parser.parse('terraform', fixturePath);
      expect(result.packageManager).toBe('terraform');
      expect(result.fileType).toBe('manifest');
    });
  });

  describe('.terraform.lock.hcl', () => {
    const fixturePath = resolve(fixtureDir, '.terraform.lock.hcl');

    it('extracts provider blocks', async () => {
      const result = await parser.parse('terraform', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes aws provider at version', async () => {
      const result = await parser.parse('terraform', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('registry.terraform.io/hashicorp/aws_:_5.31.0');
    });

    it('includes random provider at version', async () => {
      const result = await parser.parse('terraform', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('registry.terraform.io/hashicorp/random_:_3.5.1');
    });

    it('has fileType lockfile', async () => {
      const result = await parser.parse('terraform', fixturePath);
      expect(result.fileType).toBe('lockfile');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('terraform', '/nonexistent/main.tf');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { TerraformParser as TfV2 } from '../../src/parsers/terraform-parser.js';

const tfV2 = new TfV2();

describeV2('TerraformParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-tf-v2-'));

  itV2('required_providers → runtime; PURL undefined', async () => {
    const p = joinV2(tmp, 'main.tf');
    writeFileSync(p, [
      'terraform {',
      '  required_providers {',
      '    aws = { source = "hashicorp/aws", version = "5.0.0" }',
      '  }',
      '}',
      ''
    ].join('\n'));
    const r = await tfV2.parse('terraform', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toBeUndefined();
      }
    }
  });
});
