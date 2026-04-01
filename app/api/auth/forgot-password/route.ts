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
      from: 'Health Wiz <onboarding@resend.dev>',
      to: email,
      subject: 'Your Health Wiz password reset code',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111827; margin-bottom: 8px;">Password Reset</h2>
          <p style="color: #6b7280; margin-bottom: 24px;">
            Use the code below to reset your Health Wiz password. It expires in 15 minutes.
          </p>
          <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px;">
            If you didn't request this, you can safely ignore this email. Your password won't change.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
