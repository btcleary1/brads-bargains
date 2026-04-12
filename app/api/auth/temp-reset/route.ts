import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, updatePassword, createUser } from '@/lib/users';
import { r2List, r2Del } from '@/lib/r2';

export const runtime = 'nodejs';

// Temporary endpoint — remove after use
const RESET_SECRET = 'bb-reset-2026';

export async function POST(req: NextRequest) {
  try {
    const { email, newPassword, secret } = await req.json();
    if (secret !== RESET_SECRET) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
    }

    // Clear all rate-limit records so login works immediately
    try {
      const keys = await r2List('deal-wiz/rate-limit/');
      if (keys.length > 0) await r2Del(keys);
    } catch { /* non-fatal */ }

    const user = await getUserByEmail(email);
    if (!user) {
      await createUser(email, email.split('@')[0], newPassword, 'admin');
      return NextResponse.json({ success: true, created: true });
    }
    await updatePassword(user.userId, newPassword);
    return NextResponse.json({ success: true, updated: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
