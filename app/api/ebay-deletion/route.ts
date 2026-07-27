import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

// eBay Marketplace Account Deletion compliance endpoint.
// Docs: https://developer.ebay.com/marketplace-account-deletion

const VERIFICATION_TOKEN = process.env.EBAY_DELETION_TOKEN ?? '';
const ENDPOINT_URL = 'https://brads-bargains.vercel.app/api/ebay-deletion';

export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('challenge_code');
  if (challenge) {
    // eBay challenge verification: SHA-256(challengeCode + verificationToken + endpointUrl)
    const hash = createHash('sha256')
      .update(challenge + VERIFICATION_TOKEN + ENDPOINT_URL)
      .digest('hex');
    return NextResponse.json({ challengeResponse: hash });
  }
  return NextResponse.json({ ok: true });
}

export async function POST() {
  // Acknowledge deletion notification — no user data stored, nothing to delete
  return NextResponse.json({ ok: true });
}
