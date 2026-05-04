import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers } from '@/lib/users';
import { r2List, r2Get } from '@/lib/r2';

export const runtime = 'nodejs';

const SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await getAllUsers();
  const userMap = Object.fromEntries(users.map(u => [u.userId, u.name]));

  const allEntries: any[] = [];

  await Promise.allSettled(users.map(async u => {
    const keys = await r2List(`deal-wiz/audit/${u.userId}/`).catch(() => []);
    const entries = await Promise.allSettled(
      keys.map((k: string) => r2Get<any>(k))
    );
    entries.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        allEntries.push({ ...r.value, name: userMap[r.value.userId] ?? r.value.email });
      }
    });
  }));

  allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ count: allEntries.length, entries: allEntries });
}
