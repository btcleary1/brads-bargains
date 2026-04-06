import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getUserByEmail } from '@/lib/users';
import { getCredentialsForUser } from '@/lib/webauthn-store';

export const runtime = 'nodejs';

const RP_ID = process.env.WEBAUTHN_RP_ID ||
  (process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost');

export async function POST(req: NextRequest) {
  let allowCredentials: { id: string; transports?: string[] }[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.email) {
      const user = await getUserByEmail(body.email);
      if (user) {
        const creds = await getCredentialsForUser(user.userId);
        if (creds.length > 0) {
          allowCredentials = creds.map(c => ({
            id: c.id,
            ...(c.transports?.length ? { transports: c.transports as any } : {}),
          }));
        }
      }
    }
  } catch { /* fall through to discoverable mode */ }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: allowCredentials ?? [],
  } as any);

  const res = NextResponse.json(options);
  res.cookies.set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });
  return res;
}
