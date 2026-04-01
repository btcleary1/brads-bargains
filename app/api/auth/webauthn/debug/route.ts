import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getCredentialsForUser } from '@/lib/webauthn-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const creds = await getCredentialsForUser(session.userId);
  return NextResponse.json({
    count: creds.length,
    ids: creds.map(c => c.id.slice(0, 20)),
  });
}
