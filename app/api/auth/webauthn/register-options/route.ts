import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

const RP_ID = process.env.WEBAUTHN_RP_ID || 'healthwiz.vercel.app';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const options = await generateRegistrationOptions({
    rpName: 'Health Wiz',
    rpID: RP_ID,
    userID: new TextEncoder().encode(session.userId),
    userName: session.email,
    userDisplayName: session.name,
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
