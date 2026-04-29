import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

function getRpId(req: NextRequest): string {
  return req.nextUrl.hostname || process.env.WEBAUTHN_RP_ID || 'localhost';
}

function toLatin1(s: string): string {
  return s.replace(/[^\u0000-\u00FF]/g, '').trim();
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const safeName = toLatin1(session.name) || session.email;
  const safeEmail = toLatin1(session.email) || session.userId;

  const RP_ID = getRpId(req);
  const options = await generateRegistrationOptions({
    rpName: "Brad's Bargains",
    rpID: RP_ID,
    userID: new TextEncoder().encode(session.userId),
    userName: safeEmail,
    userDisplayName: safeName,
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform', // forces Face ID / Touch ID — no QR code
    },
  });

  const res = NextResponse.json(options);
  res.cookies.set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });
  return res;
}
