// src/crypto/key-manager.ts
import { generateKeyPairSync, createHash, createPrivateKey, type KeyObject } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const PRIVATE_KEY_FILE = 'sova-private.pem';
const PUBLIC_KEY_FILE = 'sova-public.pem';

export interface KeypairResult {
  privateKey: KeyObject;
  publicKeyPem: string;
  keyId: string;
}

export function computeKeyId(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
}

export function ensureKeypair(keyDir: string): KeypairResult {
  const privatePath = join(keyDir, PRIVATE_KEY_FILE);
  const publicPath = join(keyDir, PUBLIC_KEY_FILE);

  if (existsSync(privatePath) && existsSync(publicPath)) {
    const privateKeyPem = readFileSync(privatePath, 'utf-8');
    const publicKeyPem = readFileSync(publicPath, 'utf-8');
    const privateKey = createPrivateKey(privateKeyPem);
    return { privateKey, publicKeyPem, keyId: computeKeyId(publicKeyPem) };
  }

  mkdirSync(keyDir, { recursive: true });

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  writeFileSync(privatePath, privateKeyPem, { mode: 0o600 });
  chmodSync(privatePath, 0o600);
  writeFileSync(publicPath, publicKeyPem, { mode: 0o644 });

  return { privateKey, publicKeyPem, keyId: computeKeyId(publicKeyPem) };
}
