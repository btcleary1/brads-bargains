import { createHmac } from 'crypto';

// Secret for signing credential backups. Override via WEBAUTHN_SECRET env var.
const SECRET = process.env.WEBAUTHN_SECRET ?? 'hwiz-bc26-secret-v1';

export function signCredential(credJson: string): string {
  const encoded = Buffer.from(credJson).toString('base64');
  const hmac = createHmac('sha256', SECRET).update(credJson).digest('hex');
  return encoded + '.' + hmac;
}

export function verifyCredentialToken(token: string): string | null {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return null;
    const encoded = token.slice(0, dot);
    const hmac = token.slice(dot + 1);
    const credJson = Buffer.from(encoded, 'base64').toString('utf8');
    const expected = createHmac('sha256', SECRET).update(credJson).digest('hex');
    if (expected !== hmac) return null;
    return credJson;
  } catch {
    return null;
  }
}
