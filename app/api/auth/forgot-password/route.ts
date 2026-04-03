import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getUserByEmail } from '@/lib/users';
import { createResetCode } from '@/lib/reset-tokens';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    // Always return success even if email not found (prevents user enumeration)
    const user = await getUserByEmail(email);
    if (!user) return NextResponse.json({ success: true });

    const code = await createResetCode(email);

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Brad's Bargains <onboarding@resend.dev>",
      to: email,
      subject: "Your Brad's Bargains password reset code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #050814;">
          <div style="background: #0B1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); padding: 32px;">
          <h2 style="color: #F9FAFB; margin-bottom: 8px;">Password Reset</h2>
          <p style="color: #9CA3AF; margin-bottom: 24px;">
            Use the code below to reset your Brad's Bargains password. It expires in 15 minutes.
          </p>
          <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px;">
            If you didn't request this, you can safely ignore this email. Your password won't change.
          </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
