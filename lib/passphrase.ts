import { put, head } from '@vercel/blob';
import { createHash } from 'crypto';

const BLOB_PATH = 'deal-wiz/passphrase.json';

export function hashPassphrase(passphrase: string): string {
  return createHash('sha256').update(passphrase).digest('hex');
}

async function readStoredHash(): Promise<string | null> {
  try {
    const blob = await head(BLOB_PATH);
    if (!blob) return null;
    const res = await fetch(blob.downloadUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.hash ?? null;
  } catch {
    return null;
  }
}

export async function getStoredHash(): Promise<string | null> {
  const blobHash = await readStoredHash();
  if (blobHash) return blobHash;
  const envPass = process.env.APP_PASSPHRASE;
  if (envPass) return hashPassphrase(envPass);
  return null;
}

export async function savePassphraseHash(hash: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not configured.');
  await put(BLOB_PATH, JSON.stringify({ hash }), {
    access: 'private',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
