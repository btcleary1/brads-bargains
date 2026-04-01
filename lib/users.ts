import { put, list, del } from '@vercel/blob';
import { createHash, randomBytes } from 'crypto';

const PREFIX = 'health-app/users/';
const INDEX_PATH = 'health-app/users-index.json';

export interface User {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;

export function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET ?? 'health-app-salt';
  return createHash('sha256').update(salt + password).digest('hex');
}

function blobFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
}

// --- Index helpers (fast email lookups without listing all blobs) ---

async function readIndex(): Promise<{ email: string; userId: string }[]> {
  try {
    const { blobs } = await list({ prefix: INDEX_PATH });
    if (blobs.length === 0) return [];
    const res = await blobFetch(blobs[0].url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function writeIndex(index: { email: string; userId: string }[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(index), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

// --- User CRUD ---

export async function getUserByEmail(email: string): Promise<User | null> {
  const index = await readIndex();
  const entry = index.find(e => e.email.toLowerCase() === email.toLowerCase());
  if (!entry) return null;
  return getUserById(entry.userId);
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const path = `${PREFIX}${userId}.json`;
    const { blobs } = await list({ prefix: path });
    if (blobs.length === 0) return null;
    const res = await blobFetch(blobs[0].url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getAllUsers(): Promise<PublicUser[]> {
  try {
    const index = await readIndex();
    const users = await Promise.all(index.map(e => getUserById(e.userId)));
    return users
      .filter((u): u is User => u !== null)
      .map(({ passwordHash: _ph, ...pub }) => pub);
  } catch {
    return [];
  }
}

export async function createUser(
  email: string,
  name: string,
  password: string,
  role: 'admin' | 'user' = 'user'
): Promise<User> {
  const existing = await getUserByEmail(email);
  if (existing) throw new Error('An account with this email already exists.');

  const userId = randomBytes(16).toString('hex');
  const user: User = {
    userId,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
  };

  // Save user record
  await put(`${PREFIX}${userId}.json`, JSON.stringify(user), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });

  // Update index
  const index = await readIndex();
  index.push({ email: user.email, userId });
  await writeIndex(index);

  return user;
}

export async function deleteUser(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;

  // Remove user record blob
  const path = `${PREFIX}${userId}.json`;
  const { blobs } = await list({ prefix: path });
  if (blobs.length > 0) await del(blobs.map(b => b.url));

  // Update index
  const index = await readIndex();
  await writeIndex(index.filter(e => e.userId !== userId));
}

export async function updateUserRole(userId: string, role: 'admin' | 'user'): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;
  const updated = { ...user, role };
  await put(`${PREFIX}${userId}.json`, JSON.stringify(updated), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export async function userCount(): Promise<number> {
  const index = await readIndex();
  return index.length;
}
