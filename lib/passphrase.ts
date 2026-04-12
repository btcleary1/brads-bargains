import { r2Get, r2Put } from './r2';
import { createHash } from 'crypto';

const BLOB_PATH = 'deal-wiz/passphrase.json';

export function hashPassphrase(passphrase: string): string {
  return createHash('sha256').update(passphrase).digest('hex');
}

export async function getStoredHash(): Promise<string | null> {
  const data = await r2Get<{ hash: string }>(BLOB_PATH);
  if (data?.hash) return data.hash;
  const envPass = process.env.APP_PASSPHRASE;
  if (envPass) return hashPassphrase(envPass);
  return null;
}

export async function savePassphraseHash(hash: string): Promise<void> {
  await r2Put(BLOB_PATH, JSON.stringify({ hash }));
}
