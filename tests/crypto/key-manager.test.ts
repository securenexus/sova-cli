// tests/crypto/key-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ensureKeypair, computeKeyId } from '../../src/crypto/key-manager.js';
import { readFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('key-manager', () => {
  let keyDir: string;

  beforeEach(() => {
    keyDir = join(tmpdir(), `sova-keys-${Date.now()}`);
  });

  afterEach(() => {
    rmSync(keyDir, { recursive: true, force: true });
  });

  describe('ensureKeypair', () => {
    it('generates a new keypair when none exists', () => {
      const result = ensureKeypair(keyDir);
      expect(result.keyId).toMatch(/^[0-9a-f]{16}$/);
      expect(result.publicKeyPem).toContain('PUBLIC KEY');
      expect(result.privateKey).toBeDefined();

      expect(existsSync(join(keyDir, 'sova-private.pem'))).toBe(true);
      expect(existsSync(join(keyDir, 'sova-public.pem'))).toBe(true);
    });

    it('reuses existing keypair on subsequent calls', () => {
      const first = ensureKeypair(keyDir);
      const second = ensureKeypair(keyDir);
      expect(first.keyId).toBe(second.keyId);
      expect(first.publicKeyPem).toBe(second.publicKeyPem);
    });

    it('sets restrictive permissions on private key', () => {
      ensureKeypair(keyDir);
      const mode = statSync(join(keyDir, 'sova-private.pem')).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('private key is PEM PKCS8 format', () => {
      ensureKeypair(keyDir);
      const pem = readFileSync(join(keyDir, 'sova-private.pem'), 'utf-8');
      expect(pem).toContain('BEGIN PRIVATE KEY');
    });

    it('public key is PEM SPKI format', () => {
      ensureKeypair(keyDir);
      const pem = readFileSync(join(keyDir, 'sova-public.pem'), 'utf-8');
      expect(pem).toContain('BEGIN PUBLIC KEY');
    });
  });

  describe('computeKeyId', () => {
    it('returns first 16 hex chars of SHA-256 of the public key PEM', () => {
      const { publicKeyPem } = ensureKeypair(keyDir);
      const keyId = computeKeyId(publicKeyPem);
      expect(keyId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic', () => {
      const { publicKeyPem } = ensureKeypair(keyDir);
      expect(computeKeyId(publicKeyPem)).toBe(computeKeyId(publicKeyPem));
    });
  });
});
