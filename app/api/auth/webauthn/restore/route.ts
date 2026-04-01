import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// This endpoint is no longer used — credentials are stored in Vercel Blob per user.
export async function POST() {
  return NextResponse.json({ error: 'Not supported' }, { status: 410 });
}
