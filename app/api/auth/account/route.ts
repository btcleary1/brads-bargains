import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, clearSessionCookie } from '@/lib/session';
import { deleteUser } from '@/lib/users';
import { del, list } from '@vercel/blob';
import { logAudit, getClientIp } from '@/lib/audit';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, email } = session;

  // Delete all health data blobs for this user
  const { blobs: healthBlobs } = await list({ prefix: `health-data/${userId}/` });
  if (healthBlobs.length > 0) await del(healthBlobs.map(b => b.url));

  // Delete WebAuthn credentials
  const { blobs: webauthnBlobs } = await list({ prefix: `health-app/webauthn/${userId}/` });
  if (webauthnBlobs.length > 0) await del(webauthnBlobs.map(b => b.url));

  // Delete uploads
  const { blobs: uploadBlobs } = await list({ prefix: `health-app/uploads/${userId}/` });
  if (uploadBlobs.length > 0) await del(uploadBlobs.map(b => b.url));

  // Delete user record + remove from index
  await deleteUser(userId);

  logAudit({ timestamp: new Date().toISOString(), userId, email, action: 'account_deleted', ip: getClientIp(req) });

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
