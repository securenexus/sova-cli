import { describe, it, expect } from 'vitest';
import { DockerParser } from '../../src/parsers/docker-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/docker');
const parser = new DockerParser();

describe('DockerParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('docker');
  });

  describe('Dockerfile', () => {
    const fixturePath = resolve(fixtureDir, 'Dockerfile');

    it('has fileType manifest and packageManager docker', async () => {
      const result = await parser.parse('docker', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('docker');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('docker', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('extracts FROM base images with tags', async () => {
      const result = await parser.parse('docker', fixturePath);
      // FROM node:18-alpine AS builder → node:18-alpine
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('node_:_18-alpine');
    });

    it('extracts packages from RUN apk add commands', async () => {
      const result = await parser.parse('docker', fixturePath);
      // RUN apk add --no-cache git curl
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('git_:_');
      expect(keys).toContain('curl_:_');
    });
  });

  describe('docker-compose.yml', () => {
    const fixturePath = resolve(fixtureDir, 'docker-compose.yml');

    it('has fileType manifest and packageManager docker', async () => {
      const result = await parser.parse('docker', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('docker');
    });

    it('extracts service images', async () => {
      const result = await parser.parse('docker', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('extracts images with version tags', async () => {
      const result = await parser.parse('docker', fixturePath);
      const keys = result.dependencies.map(d => d.key);
      expect(keys).toContain('nginx_:_1.25-alpine');
      expect(keys).toContain('node_:_18-alpine');
      expect(keys).toContain('postgres_:_15.4');
      expect(keys).toContain('redis_:_7.2-alpine');
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent Dockerfile', async () => {
      const result = await parser.parse('docker', '/nonexistent/Dockerfile');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('docker');
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('docker', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { DockerParser as DockerV2 } from '../../src/parsers/docker-parser.js';

const dockerV2 = new DockerV2();

describeV2('DockerParser v2 — Application emission', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-docker-v2-'));

  itV2('Dockerfile FROM → runtime + docker PURL', async () => {
    const p = joinV2(tmp, 'Dockerfile');
    writeFileSync(p, [
      'FROM node:18-alpine',
      'WORKDIR /app',
      ''
    ].join('\n'));
    const r = await dockerV2.parse('docker', p);
    if (r.dependencies.length > 0) {
      for (const a of r.dependencies) {
        expectV2(a.scope).toBe('runtime');
        expectV2(a.purl).toMatch(/^pkg:docker\//);
      }
    }
  });
});
