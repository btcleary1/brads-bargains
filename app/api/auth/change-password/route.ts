import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserById, verifyPassword, updatePassword } from '@/lib/users';
import { validatePassword } from '@/lib/password-rules';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword)
      return NextResponse.json({ error: 'Current and new password are required.' }, { status: 400 });

    const user = await getUserById(session.userId);
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    if (!verifyPassword(currentPassword, user))
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });

    const { valid, errors } = validatePassword(newPassword);
    if (!valid)
      return NextResponse.json({ error: `Password requirements not met: ${errors.join(', ')}.` }, { status: 400 });

    await updatePassword(session.userId, newPassword);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
