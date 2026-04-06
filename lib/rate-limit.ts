import { put, head } from '@vercel/blob';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOB_PREFIX = 'deal-wiz/rate-limit/';

interface AttemptRecord {
  attempts: number;
  windowStart: number;
  lockedUntil?: number;
}

async function getRecord(key: string): Promise<AttemptRecord | null> {
  try {
    const blob = await head(`${BLOB_PREFIX}${key}.json`);
    if (!blob) return null;
    const res = await fetch(blob.downloadUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function saveRecord(key: string, record: AttemptRecord): Promise<void> {
  await put(`${BLOB_PREFIX}${key}.json`, JSON.stringify(record), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

function sanitizeKey(ip: string): string {
  return ip.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
}

export async function checkRateLimit(ip: string): Promise<void> {
  const key = sanitizeKey(ip);
  const now = Date.now();
  const record = await getRecord(key);
  if (!record) return;
  if (record.lockedUntil && now < record.lockedUntil) {
    const secondsLeft = Math.ceil((record.lockedUntil - now) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${secondsLeft} seconds.`);
  }
  if (now - record.windowStart > WINDOW_MS) return;
  if (record.attempts >= MAX_ATTEMPTS) {
    const secondsLeft = Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${secondsLeft} seconds.`);
  }
}

export async function recordFailure(ip: string): Promise<void> {
  const key = sanitizeKey(ip);
  const now = Date.now();
  const record = await getRecord(key);
  let updated: AttemptRecord;
  if (!record || now - record.windowStart > WINDOW_MS) {
    updated = { attempts: 1, windowStart: now };
  } else {
    updated = { ...record, attempts: record.attempts + 1 };
  }
  if (updated.attempts >= MAX_ATTEMPTS) {
    updated.lockedUntil = now + WINDOW_MS;
  }
  await saveRecord(key, updated);
}

export async function clearFailures(ip: string): Promise<void> {
  const key = sanitizeKey(ip);
  await saveRecord(key, { attempts: 0, windowStart: Date.now() });
}
