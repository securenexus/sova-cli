// src/crypto/verifier.ts
import { verify, createPublicKey } from 'node:crypto';
import type { SovaManifest } from '../types/manifest.js';

export interface VerificationResult {
  valid: boolean;
  keyId: string;
  signedAt: string;
  algorithm: string;
  error?: string;
}

export function verifyManifest(manifest: SovaManifest): VerificationResult {
  if (!manifest.integrity) {
    return {
      valid: false,
      keyId: '',
      signedAt: '',
      algorithm: '',
      error: 'Manifest is not signed (no integrity block found)',
    };
  }

  const { integrity, ...unsigned } = manifest;

  try {
    const dataToVerify = JSON.stringify(unsigned, null, 2);
    const signatureBuffer = Buffer.from(integrity.signature, 'base64');
    const publicKey = createPublicKey({
      key: Buffer.from(integrity.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const isValid = verify(null, Buffer.from(dataToVerify), publicKey, signatureBuffer);

    if (isValid) {
      return {
        valid: true,
        keyId: integrity.keyId,
        signedAt: integrity.signedAt,
        algorithm: integrity.algorithm,
      };
    }

    return {
      valid: false,
      keyId: integrity.keyId,
      signedAt: integrity.signedAt,
      algorithm: integrity.algorithm,
      error: 'Signature verification failed — manifest may have been tampered with',
    };
  } catch (err) {
    return {
      valid: false,
      keyId: integrity.keyId || '',
      signedAt: integrity.signedAt || '',
      algorithm: integrity.algorithm || '',
      error: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
