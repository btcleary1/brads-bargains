import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, clearSessionCookie } from '@/lib/session';
import { deleteUser } from '@/lib/users';
import { del, list } from '@vercel/blob';
import { deleteCredentialsForUser } from '@/lib/webauthn-store';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, email } = session;

  // Delete all deal data blobs for this user
  const { blobs: dealBlobs } = await list({ prefix: `deal-wiz/${userId}/` });
  if (dealBlobs.length > 0) await del(dealBlobs.map(b => b.url));

  // Delete WebAuthn credentials
  await deleteCredentialsForUser(userId);

  // Delete user record + remove from index
  await deleteUser(userId);

  logAudit({ timestamp: new Date().toISOString(), userId, email, action: 'account_deleted', ip: getClientIp(req) });

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
