import { put, list } from '@vercel/blob';
import { createHash } from 'crypto';

const BLOB_PATH = 'health-app/passphrase.json';

export function hashPassphrase(passphrase: string): string {
  return createHash('sha256').update(passphrase).digest('hex');
}

async function readStoredHash(): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.hash ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the stored passphrase hash.
 * Priority: Blob storage → APP_PASSPHRASE env var (plain, hashed on the fly)
 */
export async function getStoredHash(): Promise<string | null> {
  const blobHash = await readStoredHash();
  if (blobHash) return blobHash;

  // Fallback: env var (supports initial setup before Blob is configured)
  const envPass = process.env.APP_PASSPHRASE;
  if (envPass) return hashPassphrase(envPass);

  return null;
}

/**
 * Saves a new passphrase hash to Blob storage.
 */
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
