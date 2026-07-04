import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signManifest } from '../../src/crypto/signer.js';
import { ensureKeypair } from '../../src/crypto/key-manager.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublicKey, verify } from 'node:crypto';
import type { SovaManifest } from '../../src/types/manifest.js';

function makeStubManifest(): SovaManifest {
  return {
    version: '1.0.0',
    generatedAt: '2026-04-13T00:00:00.000Z',
    tool: { name: '@securenexus/sova', version: '1.0.0' },
    project: { name: 'test', version: '1.0.0', path: '/tmp/test' },
    scan: { languagesDetected: ['javascript'], totalFiles: 1, totalDependencies: 2, hasLockFiles: false },
    applications: { javascript: ['express_:_4.18.2', 'lodash_:_4.17.21'] },
    dependencyGraph: {},
    files: [],
    fileResults: [],
    securitySignals: { signals: [], totalSignals: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };
}

describe('signManifest', () => {
  let keyDir: string;

  beforeEach(() => {
    keyDir = join(tmpdir(), `sova-sign-${Date.now()}`);
    mkdirSync(keyDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(keyDir, { recursive: true, force: true });
  });

  it('adds integrity block to manifest', () => {
    const keypair = ensureKeypair(keyDir);
    const manifest = makeStubManifest();
    const signed = signManifest(manifest, keypair);

    expect(signed.integrity).toBeDefined();
    expect(signed.integrity!.algorithm).toBe('Ed25519');
    expect(signed.integrity!.keyId).toBe(keypair.keyId);
    expect(signed.integrity!.signature).toBeTruthy();
    expect(signed.integrity!.publicKey).toBeTruthy();
    expect(signed.integrity!.signedAt).toBeTruthy();
  });

  it('signature verifies against the manifest content (without integrity block)', () => {
    const keypair = ensureKeypair(keyDir);
    const manifest = makeStubManifest();
    const signed = signManifest(manifest, keypair);

    const { integrity, ...unsigned } = signed;
    const dataToVerify = JSON.stringify(unsigned, null, 2);

    const signatureBuffer = Buffer.from(integrity!.signature, 'base64');
    const publicKey = createPublicKey({
      key: Buffer.from(integrity!.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const isValid = verify(null, Buffer.from(dataToVerify), publicKey, signatureBuffer);
    expect(isValid).toBe(true);
  });

  it('does not mutate the original manifest object', () => {
    const keypair = ensureKeypair(keyDir);
    const manifest = makeStubManifest();
    signManifest(manifest, keypair);
    expect(manifest.integrity).toBeUndefined();
  });
});
