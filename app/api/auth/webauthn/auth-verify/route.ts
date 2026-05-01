import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { findCredentialById, updateCredentialCounter, getCredentialsForUser, saveCredentialsForUser } from '@/lib/webauthn-store';
import { getUserById, getUserByEmail, incrementLoginCount } from '@/lib/users';
import { setSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';

function getRpId(req: NextRequest): string {
  const origin = req.headers.get('origin');
  if (origin) { try { return new URL(origin).hostname; } catch {} }
  return req.nextUrl.hostname || process.env.WEBAUTHN_RP_ID || 'localhost';
}

export async function POST(req: NextRequest) {
  const RP_ID = getRpId(req);
  const ORIGIN = req.headers.get('origin') || `https://${RP_ID}`;
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
    let user = await getUserById(stored.userId);
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 400 });
    }

    // If the credential is linked to a different userId than the canonical account for
    // this email (e.g. passkey was registered against an empty duplicate account),
    // migrate the credential to the canonical userId so both login methods stay in sync.
    const canonicalUser = await getUserByEmail(user.email);
    if (canonicalUser && canonicalUser.userId !== user.userId) {
      const oldCreds = await getCredentialsForUser(user.userId);
      const migratedCreds = oldCreds.map(c =>
        c.id === stored.id ? { ...c, userId: canonicalUser.userId } : c
      );
      await saveCredentialsForUser(canonicalUser.userId, [
        ...await getCredentialsForUser(canonicalUser.userId),
        ...migratedCreds.filter(c => c.id === stored.id),
      ]);
      user = canonicalUser;
    }

    await incrementLoginCount(user.userId);
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
