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
  return (
    headers.get?.('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get?.('x-real-ip') ??
    'unknown'
  );
}
