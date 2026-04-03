import { NextRequest, NextResponse } from 'next/server';
import { verifyResetCode } from '@/lib/reset-tokens';
import { getUserByEmail, updatePassword } from '@/lib/users';
import { validatePassword } from '@/lib/password-rules';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json();
    if (!email || !code || !newPassword)
      return NextResponse.json({ error: 'Email, code, and new password are required.' }, { status: 400 });

    const { valid, errors } = validatePassword(newPassword);
    if (!valid)
      return NextResponse.json({ error: `Password requirements not met: ${errors.join(', ')}.` }, { status: 400 });

    const ok = await verifyResetCode(email, code);
    if (!ok)
      return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });

    const user = await getUserByEmail(email);
    if (!user)
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    await updatePassword(user.userId, newPassword);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
