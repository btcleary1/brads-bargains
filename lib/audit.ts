import { r2Put } from './r2';

export type AuditAction =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'register'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'account_deleted'
  | 'admin_password_reset'
  | 'admin_user_deleted';

export interface AuditEntry {
  timestamp: string;
  userId: string;
  email: string;
  action: AuditAction;
  ip: string;
  details?: string;
}

export function logAudit(entry: AuditEntry): void {
  // Fire and forget — never block the response
  const path = `deal-wiz/audit/${entry.userId}/${Date.now()}.json`;
  r2Put(path, JSON.stringify(entry)).catch(() => {});
}

export function getClientIp(req: Request): string {
  const headers = req instanceof Request ? req.headers : (req as any).headers;

  // Take the RIGHTMOST X-Forwarded-For entry, not the leftmost. Vercel appends
  // the real peer address to whatever the client sent, so the left end of the
  // list is attacker-controlled — reading [0] let anyone mint a fresh rate-limit
  // bucket per request by rotating the header, which defeated the login lockout.
  const xff = headers.get?.('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p: string) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get?.('x-real-ip') ?? 'unknown';
}
