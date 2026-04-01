import { NextRequest, NextResponse } from 'next/server';
import { getStoredHash, hashPassphrase, savePassphraseHash } from '@/lib/passphrase';
import { getSessionFromRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { currentPassphrase, newPassphrase } = await req.json();

    if (!currentPassphrase || !newPassphrase) {
      return NextResponse.json({ error: 'Both current and new passphrase are required.' }, { status: 400 });
    }

    if (newPassphrase.length < 4) {
      return NextResponse.json({ error: 'New passphrase must be at least 4 characters.' }, { status: 400 });
    }

    const storedHash = await getStoredHash();
    if (!storedHash) {
      return NextResponse.json({ error: 'No passphrase configured.' }, { status: 500 });
    }

    if (hashPassphrase(currentPassphrase) !== storedHash) {
      return NextResponse.json({ error: 'Current passphrase is incorrect.' }, { status: 401 });
    }

    await savePassphraseHash(hashPassphrase(newPassphrase));

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
