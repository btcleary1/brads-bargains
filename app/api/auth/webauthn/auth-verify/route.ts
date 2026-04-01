import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { findCredentialById, updateCredentialCounter } from '@/lib/webauthn-store';
import { getUserById } from '@/lib/users';
import { setSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';

const RP_ID = process.env.WEBAUTHN_RP_ID || 'healthwiz.vercel.app';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || `https://${RP_ID}`;

export async function POST(req: NextRequest) {
  const challenge = req.cookies.get('webauthn_challenge')?.value;
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge expired. Please try again.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const stored = await findCredentialById(body.id);

    if (!stored) {
      return NextResponse.json({ error: 'Passkey not recognized on this account.' }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
        counter: stored.counter,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed.' }, { status: 400 });
    }

    await updateCredentialCounter(stored.id, verification.authenticationInfo.newCounter);

    // Look up the user who owns this credential
    const user = await getUserById(stored.userId);
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 400 });
    }

    const res = NextResponse.json({ success: true });
    setSessionCookie(res, {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    res.cookies.delete('webauthn_challenge');
    return res;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
