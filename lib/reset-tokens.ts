import { r2Get, r2Put, r2Del } from './r2';
import { randomBytes } from 'crypto';

const PREFIX = 'deal-wiz/reset-tokens/';
const TTL_MS = 15 * 60 * 1000;

interface ResetToken {
  email: string;
  code: string;
  expiresAt: number;
}

export async function createResetCode(email: string): Promise<string> {
  const code = randomBytes(3).reduce((acc, b) => acc * 256 + b, 0).toString().slice(-6).padStart(6, '0');
  const record: ResetToken = { email: email.toLowerCase(), code, expiresAt: Date.now() + TTL_MS };
  const key = Buffer.from(email.toLowerCase()).toString('hex');
  await r2Put(`${PREFIX}${key}.json`, JSON.stringify(record));
  return code;
}

export async function verifyResetCode(email: string, code: string): Promise<boolean> {
  const key = Buffer.from(email.toLowerCase()).toString('hex');
  const path = `${PREFIX}${key}.json`;
  const record = await r2Get<ResetToken>(path);
  if (!record) return false;
  if (record.email !== email.toLowerCase()) return false;
  if (record.code !== code) return false;
  if (Date.now() > record.expiresAt) return false;
  await r2Del(path);
  return true;
}
