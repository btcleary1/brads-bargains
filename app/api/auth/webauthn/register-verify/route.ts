import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getCredentialsForUser, saveCredentialsForUser } from '@/lib/webauthn-store';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

const RP_ID = process.env.WEBAUTHN_RP_ID ||
  (process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost');
const ORIGIN = process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || `https://${RP_ID}`;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const challenge = req.cookies.get('webauthn_challenge')?.value;
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge expired. Please try again.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed.' }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;
    const transports: string[] =
      body.response?.transports ??
      (body.authenticatorAttachment === 'platform' ? ['internal'] : []);
    const newCred = {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      userId: session.userId,
      transports,
    };

    const existing = await getCredentialsForUser(session.userId);
    const others = existing.filter(c => c.id !== newCred.id);
    await saveCredentialsForUser(session.userId, [...others, newCred]);

    const res = NextResponse.json({ success: true });
    res.cookies.delete('webauthn_challenge');
    return res;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
