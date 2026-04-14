import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// eBay Marketplace Account Deletion compliance endpoint.
// eBay sends a GET challenge and POST deletion notifications to this URL.
// Responding with HTTP 200 satisfies the compliance requirement.

export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('challenge_code');
  if (challenge) {
    // eBay ownership verification — echo back the challenge code
    return NextResponse.json({ challengeResponse: challenge });
  }
  return NextResponse.json({ ok: true });
}

export async function POST() {
  // Acknowledge deletion notification — no user data stored, nothing to delete
  return NextResponse.json({ ok: true });
}
