import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, updatePassword } from '@/lib/users';

export const runtime = 'nodejs';

// Temporary endpoint — remove after use
const RESET_SECRET = 'bb-reset-2026';

export async function POST(req: NextRequest) {
  const { email, newPassword, secret } = await req.json();
  if (secret !== RESET_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
  }
  const user = await getUserByEmail(email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  await updatePassword(user.userId, newPassword);
  return NextResponse.json({ success: true });
}
