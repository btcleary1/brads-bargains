import { put, list, del } from '@vercel/blob';
import { randomBytes } from 'crypto';

const PREFIX = 'health-app/reset-tokens/';
const TTL_MS = 15 * 60 * 1000; // 15 minutes

interface ResetToken {
  email: string;
  code: string;
  expiresAt: number;
}

function blobFetch(url: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
}

export async function createResetCode(email: string): Promise<string> {
  // 6-digit numeric code
  const code = randomBytes(3).reduce((acc, b) => acc * 256 + b, 0).toString().slice(-6).padStart(6, '0');
  const record: ResetToken = { email: email.toLowerCase(), code, expiresAt: Date.now() + TTL_MS };
  const key = Buffer.from(email.toLowerCase()).toString('hex');
  await put(`${PREFIX}${key}.json`, JSON.stringify(record), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return code;
}

export async function verifyResetCode(email: string, code: string): Promise<boolean> {
  const key = Buffer.from(email.toLowerCase()).toString('hex');
  const { blobs } = await list({ prefix: `${PREFIX}${key}.json` });
  if (blobs.length === 0) return false;
  const res = await blobFetch(blobs[0].url);
  if (!res.ok) return false;
  const record: ResetToken = await res.json();
  if (record.email !== email.toLowerCase()) return false;
  if (record.code !== code) return false;
  if (Date.now() > record.expiresAt) return false;
  // Delete token after successful verification
  await del(blobs.map(b => b.url));
  return true;
}
