import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';

export const runtime = 'nodejs';

function getRpId(req: NextRequest): string {
  return req.nextUrl.hostname || process.env.WEBAUTHN_RP_ID || 'localhost';
}

// Step 1 of logging in with Face ID. No email is asked for and nothing about accounts is revealed:
// the device offers whichever passkey it holds for this site (a discoverable passkey).
export async function POST(req: NextRequest) {
  const RP_ID = getRpId(req);
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: [],
  } as any);

  const res = NextResponse.json(options);
  res.cookies.set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 300,
    path: '/',
  });
  return res;
}
