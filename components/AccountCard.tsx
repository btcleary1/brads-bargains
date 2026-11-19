'use client';

import { useEffect, useState } from 'react';

// The Account card at the top of Settings, the same in every Cleary app: who's signed in, and a
// labelled "Log out" button. Logging out isn't destructive (Face ID or Google gets you back in),
// so no red and no confirm; it ends the session, clears this tab's cached data and fully reloads
// to the login page so nothing from this session stays in memory.
async function logOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
  try {
    sessionStorage.clear();
  } catch {}
  window.location.replace('/login');
}

type Me = { name?: string; email?: string; role?: string };

export default function AccountCard({ theme }: { theme: 'dark' | 'light' }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d))
      .catch(() => setMe(null));
  }, []);

  const dark = theme === 'dark';
  const role = me?.role === 'admin' ? 'Owner' : me?.role ? 'Member' : '';
  return (
    <section
      className={dark ? 'rounded-2xl p-5 mb-4' : 'bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4'}
      style={dark ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' } : undefined}
      aria-label="Account"
    >
      <h2 className={dark ? 'font-semibold text-white text-[15px] mb-3' : 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'}>Account</h2>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className={`font-semibold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{me?.name || me?.email || '…'}</div>
          <div className={`text-sm truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            {[me?.email && me.email !== me?.name ? me.email : '', role].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await logOut();
          }}
          className={`px-4 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
            dark ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-50'
          }`}
          style={{ minHeight: 44, border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid #D1D5DB', background: dark ? 'rgba(255,255,255,0.06)' : '#FFFFFF' }}
        >
          {busy ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </section>
  );
}
