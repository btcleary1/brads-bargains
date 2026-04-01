import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserById } from '@/lib/users';
import { put } from '@vercel/blob';
import { createHash, randomBytes } from 'crypto';

export const runtime = 'nodejs';

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET ?? 'health-app-salt';
  return createHash('sha256').update(salt + password).digest('hex');
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pass = '';
  const bytes = randomBytes(12);
  for (let i = 0; i < 12; i++) {
    pass += chars[bytes[i] % chars.length];
  }
  return pass;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required.' }, { status: 400 });

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  const tempPassword = generateTempPassword();
  const updated = { ...user, passwordHash: hashPassword(tempPassword) };

  await put(`health-app/users/${userId}.json`, JSON.stringify(updated), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });

  return NextResponse.json({ success: true, tempPassword, email: user.email });
}
