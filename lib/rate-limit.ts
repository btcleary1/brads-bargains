import { put, list } from '@vercel/blob';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;            // lockout after 5 failures
const BLOB_PREFIX = 'health-app/rate-limit/';

interface AttemptRecord {
  attempts: number;
  windowStart: number; // epoch ms
  lockedUntil?: number; // epoch ms
}

async function getRecord(key: string): Promise<AttemptRecord | null> {
  try {
    const { blobs } = await list({ prefix: `${BLOB_PREFIX}${key}.json` });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, {
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

// Sanitize IP for use as a blob key
function sanitizeKey(ip: string): string {
  return ip.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
}

export async function checkRateLimit(ip: string): Promise<void> {
  const key = sanitizeKey(ip);
  const now = Date.now();
  const record = await getRecord(key);

  if (!record) return; // no history, allow

  // Still locked out?
  if (record.lockedUntil && now < record.lockedUntil) {
    const secondsLeft = Math.ceil((record.lockedUntil - now) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${secondsLeft} seconds.`);
  }

  // Window expired — reset
  if (now - record.windowStart > WINDOW_MS) return;

  // Within window and over limit
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
    // Start a new window
    updated = { attempts: 1, windowStart: now };
  } else {
    updated = { ...record, attempts: record.attempts + 1 };
  }

  // Lock out if over limit
  if (updated.attempts >= MAX_ATTEMPTS) {
    updated.lockedUntil = now + WINDOW_MS;
  }

  await saveRecord(key, updated);
}

export async function clearFailures(ip: string): Promise<void> {
  const key = sanitizeKey(ip);
  // Reset by writing a clean record
  await saveRecord(key, { attempts: 0, windowStart: Date.now() });
}
