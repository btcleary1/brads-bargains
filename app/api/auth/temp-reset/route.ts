import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, updatePassword, createUser } from '@/lib/users';

export const runtime = 'nodejs';

// Temporary endpoint — remove after use
const RESET_SECRET = 'bb-reset-2026';

export async function POST(req: NextRequest) {
  const { email, newPassword, secret } = await req.json();
  if (secret !== RESET_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
  }
  const user = await getUserByEmail(email);
  if (!user) {
    // Account missing from index — create fresh
    await createUser(email, email.split('@')[0], newPassword, 'admin');
    return NextResponse.json({ success: true, created: true });
  }
  await updatePassword(user.userId, newPassword);
  return NextResponse.json({ success: true, updated: true });
}
