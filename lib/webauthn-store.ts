import { r2Get, r2Put, r2Del } from './r2';

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

async function readCredIndex(): Promise<Record<string, string>> {
  return (await r2Get<Record<string, string>>(CRED_INDEX_PATH)) ?? {};
}

async function writeCredIndex(index: Record<string, string>): Promise<void> {
  await r2Put(CRED_INDEX_PATH, JSON.stringify(index));
}

export async function getCredentialsForUser(userId: string): Promise<StoredCredential[]> {
  return (await r2Get<StoredCredential[]>(credPath(userId))) ?? [];
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
  await r2Put(credPath(userId), JSON.stringify(creds));

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
  await r2Del(credPath(userId));

  const index = await readCredIndex();
  for (const key of Object.keys(index)) {
    if (index[key] === userId) delete index[key];
  }
  await writeCredIndex(index);
}

export async function updateCredentialCounter(credId: string, newCounter: number): Promise<void> {
  const cred = await findCredentialById(credId);
  if (!cred) return;
  const all = await getCredentialsForUser(cred.userId);
  const updated = all.map(c => c.id === credId ? { ...c, counter: newCounter } : c);
  await saveCredentialsForUser(cred.userId, updated);
}
