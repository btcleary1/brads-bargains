import { NextResponse } from 'next/server';
import { freezeLegacySalt } from '@/lib/legacy-salt';

// Called by Keybot before it changes SESSION_SECRET. Safe to call any number of times: it only ever
// stores the salt once and returns nothing but whether that's done.
export async function POST() {
  try {
    return NextResponse.json({ frozen: await freezeLegacySalt() });
  } catch {
    return NextResponse.json({ frozen: false }, { status: 503 });
  }
}
