import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getCredentialsForUser } from '@/lib/webauthn-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ registered: false, count: 0 });
  }
  const creds = await getCredentialsForUser(session.userId);
  return NextResponse.json({ registered: creds.length > 0, count: creds.length });
}
