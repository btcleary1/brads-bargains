import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, clearSessionCookie } from '@/lib/session';
import { deleteUser } from '@/lib/users';
import { del } from '@vercel/blob';
import { deleteCredentialsForUser } from '@/lib/webauthn-store';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

const USER_BLOBS = (userId: string) => [
  `deal-wiz/${userId}/deals.json`,
  `deal-wiz/${userId}/searches.json`,
  `deal-wiz/${userId}/prefs.json`,
];

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, email } = session;

  // Delete all deal data blobs for this user (explicit paths — no list() needed)
  await del(USER_BLOBS(userId)).catch(() => {});

  // Delete WebAuthn credentials
  await deleteCredentialsForUser(userId);

  // Delete user record + remove from index
  await deleteUser(userId);

  logAudit({ timestamp: new Date().toISOString(), userId, email, action: 'account_deleted', ip: getClientIp(req) });

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
