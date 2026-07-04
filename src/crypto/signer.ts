// src/crypto/signer.ts
import { sign } from 'node:crypto';
import type { SovaManifest } from '../types/manifest.js';
import type { KeypairResult } from './key-manager.js';

export function signManifest(manifest: SovaManifest, keypair: KeypairResult): SovaManifest {
  // Clone without integrity field
  const { integrity: _, ...unsigned } = manifest;
  const dataToSign = JSON.stringify(unsigned, null, 2);

  const signature = sign(null, Buffer.from(dataToSign), keypair.privateKey);

  // Extract raw DER bytes from PEM public key
  const publicKeyDer = Buffer.from(
    keypair.publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----\n?/, '')
      .replace(/\n?-----END PUBLIC KEY-----\n?/, '')
      .replace(/\n/g, ''),
    'base64',
  );

  return {
    ...unsigned,
    integrity: {
      signature: signature.toString('base64'),
      publicKey: publicKeyDer.toString('base64'),
      keyId: keypair.keyId,
      algorithm: 'Ed25519',
      signedAt: new Date().toISOString(),
    },
  };
}
