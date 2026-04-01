import { put } from '@vercel/blob';

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
  const path = `health-app/audit/${entry.userId}/${Date.now()}.json`;
  put(path, JSON.stringify(entry), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/json',
  }).catch(() => {});
}

export function getClientIp(req: Request): string {
  const headers = req instanceof Request ? req.headers : (req as any).headers;
  return (
    headers.get?.('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get?.('x-real-ip') ??
    'unknown'
  );
}
