import { put, head, del } from '@vercel/blob';

export interface StoredCredential {
  id: string;
  publicKey: string; // base64
  counter: number;
  userId: string;
  transports?: string[]; // e.g. ['internal'] for platform (Face ID / Touch ID)
}

function credPath(userId: string): string {
  return `deal-wiz/webauthn/${userId}/credentials.json`;
}

const CRED_INDEX_PATH = 'deal-wiz/webauthn/cred-index.json';

function blobFetch(url: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    cache: 'no-store',
  });
}

async function readCredIndex(): Promise<Record<string, string>> {
  try {
    const blob = await head(CRED_INDEX_PATH);
    if (!blob) return {};
    const res = await blobFetch(blob.downloadUrl);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

async function writeCredIndex(index: Record<string, string>): Promise<void> {
  await put(CRED_INDEX_PATH, JSON.stringify(index), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export async function getCredentialsForUser(userId: string): Promise<StoredCredential[]> {
  try {
    const blob = await head(credPath(userId));
    if (!blob) return [];
    const res = await blobFetch(blob.downloadUrl);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function findCredentialById(credId: string): Promise<StoredCredential | null> {
  try {
    const index = await readCredIndex();
    const userId = index[credId];
    if (!userId) return null;
    const creds = await getCredentialsForUser(userId);
    return creds.find(c => c.id === credId) ?? null;
  } catch {
    return null;
  }
}

export async function saveCredentialsForUser(userId: string, creds: StoredCredential[]): Promise<void> {
  await put(credPath(userId), JSON.stringify(creds), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });

  const index = await readCredIndex();
  for (const key of Object.keys(index)) {
    if (index[key] === userId) delete index[key];
  }
  for (const cred of creds) {
    index[cred.id] = userId;
  }
  await writeCredIndex(index);
}

export async function deleteCredentialsForUser(userId: string): Promise<void> {
  const blob = await head(credPath(userId));
  if (blob) await del(blob.url);

  const index = await readCredIndex();
  for (const key of Object.keys(index)) {
    if (index[key] === userId) delete index[key];
  }
  await writeCredIndex(index);
}

export async function updateCredentialCounter(credId: string, newCounter: number): Promise<void> {
  const cred = await findCredentialById(credId);
  if (!cred) return;
  const userId = cred.userId;
  const all = await getCredentialsForUser(userId);
  const updated = all.map(c => c.id === credId ? { ...c, counter: newCounter } : c);
  await saveCredentialsForUser(userId, updated);
}
