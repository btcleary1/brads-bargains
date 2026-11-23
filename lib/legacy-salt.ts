// Old SHA-256 password hashes were salted with SESSION_SECRET. To let SESSION_SECRET change (Keybot)
// without locking those people out, the salt is copied once into storage ("frozen") and old hashes are
// checked against that copy from then on. The copy only verifies old hashes; it signs nothing.
// Everyone with an old hash is upgraded to scrypt the next time they log in.
import { r2GetStrict, r2Put } from './r2';

const KEY = 'deal-wiz/legacy-password-salt.json';
let cached: string | undefined;

export async function legacySalt(): Promise<string> {
  if (cached) return cached;
  const saved = await r2GetStrict<{ salt: string }>(KEY);
  if (saved?.salt) return (cached = saved.salt);
  return process.env.SESSION_SECRET ?? 'deal-wiz-salt';
}

// Copies the current salt into storage if it isn't there yet. First copy wins and is never replaced,
// so calling this after SESSION_SECRET has changed can't overwrite the real salt. A storage error throws
// instead of writing.
export async function freezeLegacySalt(): Promise<boolean> {
  const saved = await r2GetStrict<{ salt: string }>(KEY);
  if (saved?.salt) return true;
  const salt = process.env.SESSION_SECRET;
  if (!salt) return false;
  await r2Put(KEY, JSON.stringify({ salt, frozenAt: new Date().toISOString() }));
  return true;
}
