// tests/crypto/verifier.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyManifest, type VerificationResult } from '../../src/crypto/verifier.js';
import { signManifest } from '../../src/crypto/signer.js';
import { ensureKeypair } from '../../src/crypto/key-manager.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

describe('verifyManifest', () => {
  let keyDir: string;

  beforeEach(() => {
    keyDir = join(tmpdir(), `sova-verify-${Date.now()}`);
    mkdirSync(keyDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(keyDir, { recursive: true, force: true });
  });

  it('returns valid for a correctly signed manifest', () => {
    const keypair = ensureKeypair(keyDir);
    const signed = signManifest(makeStubManifest(), keypair);
    const result = verifyManifest(signed);

    expect(result.valid).toBe(true);
    expect(result.keyId).toBe(keypair.keyId);
    expect(result.algorithm).toBe('Ed25519');
    expect(result.error).toBeUndefined();
  });

  it('returns invalid when manifest content is tampered', () => {
    const keypair = ensureKeypair(keyDir);
    const signed = signManifest(makeStubManifest(), keypair);
    signed.applications.javascript.push('malicious_:_1.0.0');

    const result = verifyManifest(signed);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid when signature is tampered', () => {
    const keypair = ensureKeypair(keyDir);
    const signed = signManifest(makeStubManifest(), keypair);
    signed.integrity!.signature = Buffer.from('corrupted').toString('base64');

    const result = verifyManifest(signed);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when integrity block is missing', () => {
    const manifest = makeStubManifest();
    const result = verifyManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not signed');
  });
});
