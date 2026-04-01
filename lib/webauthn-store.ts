import { put, list, del } from '@vercel/blob';

export interface StoredCredential {
  id: string;
  publicKey: string; // base64
  counter: number;
  userId: string;
}

// Credentials are encoded in the blob pathname — no content reads needed.
// Path: webauthn/{userId}/c/{encoded}
function prefixFor(userId: string) {
  return `webauthn/${userId}/c/`;
}

// Legacy prefix for single-user migration
const LEGACY_PREFIX = 'webauthn/c/';

function encodeToPath(cred: StoredCredential): string {
  const json = JSON.stringify(cred);
  return Buffer.from(json).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeFromPath(encoded: string): StoredCredential | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function getCredentialsForUser(userId: string): Promise<StoredCredential[]> {
  try {
    const { blobs } = await list({ prefix: prefixFor(userId) });
    return blobs
      .map(b => decodeFromPath(b.pathname.slice(prefixFor(userId).length)))
      .filter((c): c is StoredCredential => c !== null);
  } catch {
    return [];
  }
}

/** Find which user owns a given credential ID (needed for WebAuthn login before session exists) */
export async function findCredentialById(credId: string): Promise<StoredCredential | null> {
  try {
    // Search all user credential blobs
    const { blobs } = await list({ prefix: 'webauthn/' });
    for (const blob of blobs) {
      // Skip legacy prefix
      if (blob.pathname.startsWith(LEGACY_PREFIX)) continue;
      const parts = blob.pathname.split('/');
      // pathname: webauthn/{userId}/c/{encoded}
      if (parts.length < 4) continue;
      const encoded = parts[3];
      const cred = decodeFromPath(encoded);
      if (cred && cred.id === credId) return cred;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCredentialsForUser(userId: string, creds: StoredCredential[]): Promise<void> {
  const prefix = prefixFor(userId);
  // Delete existing credentials for this user
  const { blobs } = await list({ prefix });
  if (blobs.length > 0) {
    await del(blobs.map(b => b.url));
  }
  for (const cred of creds) {
    await put(`${prefix}${encodeToPath(cred)}`, '{}', {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }
}

/** Update counter for a specific credential */
export async function updateCredentialCounter(credId: string, newCounter: number): Promise<void> {
  const cred = await findCredentialById(credId);
  if (!cred) return;
  const userId = cred.userId;
  const all = await getCredentialsForUser(userId);
  const updated = all.map(c => c.id === credId ? { ...c, counter: newCounter } : c);
  await saveCredentialsForUser(userId, updated);
}
