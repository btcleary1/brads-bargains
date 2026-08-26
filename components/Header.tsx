'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, Search, BarChart2, LogOut, Settings, Ticket } from 'lucide-react';

const navItems = [
  { href: '/deals',   label: 'Find Deals', icon: Search },
  { href: '/tracker', label: 'Tracker',    icon: BarChart2 },
  { href: '/tickets', label: 'Tickets',    icon: Ticket, adminOnly: true },
];

export default function Header() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(me => setIsAdmin(me?.role === 'admin')).catch(() => { /* stay non-admin */ });
  }, []);

  useEffect(() => {
    // Inject a /deals sentinel into history so pressing back from an external entry
    // stays in-app rather than leaving to the previous website.
    if (!sessionStorage.getItem('_appEntered')) {
      sessionStorage.setItem('_appEntered', '1');
      const fromExternal = !document.referrer || !document.referrer.startsWith(window.location.origin);
      if (fromExternal) {
        const current = window.location.pathname + window.location.search + window.location.hash;
        window.history.pushState(null, '', '/deals');
        window.history.pushState(null, '', current);
      }
    }
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <>
      <header
        className="sticky top-0 z-50"
        style={{
          background: 'linear-gradient(180deg, #050814 0%, #0B1120 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/deals" className="flex items-center gap-2.5">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
                style={{ background: '#0D1B2A', boxShadow: '0 2px 10px rgba(13,27,42,0.6)' }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <defs>
                    <linearGradient id="aif-h" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="50%" stopColor="#10B981"/>
                      <stop offset="50%" stopColor="#1D4ED8"/>
                    </linearGradient>
                  </defs>
                  <polygon points="9,2 4.5,7.4 6.85,7.4 6.85,15.5 11.15,15.5 11.15,7.4 13.5,7.4" fill="url(#aif-h)"/>
                </svg>
              </div>
              <span className="font-bold text-white text-[15px] tracking-tight">AI FLIP</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-2">
              <nav
                className="flex items-center gap-0.5 rounded-xl p-1"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                {visibleNavItems.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname?.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                        isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                      }`}
                      style={isActive ? { background: 'rgba(255,255,255,0.12)' } : {}}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <Link
                href="/settings"
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                  pathname?.startsWith('/settings') ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
                style={pathname?.startsWith('/settings') ? { background: 'rgba(255,255,255,0.12)' } : {}}
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-200 transition-all"
                style={{ minHeight: 'unset' }}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile top-right */}
            <div className="sm:hidden flex items-center gap-2">
              <Link href="/settings" className="flex items-center justify-center w-9 h-9 rounded-xl text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <Settings className="w-5 h-5" />
              </Link>
              <button onClick={handleLogout} className="flex items-center justify-center w-9 h-9 rounded-xl text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', minHeight: 'unset' }}>
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: 'rgba(5,8,20,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {visibleNavItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname?.startsWith(href);
          return (
            <Link key={href} href={href} className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative">
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: '#3B82F6' }} />
              )}
              <Icon className="w-[22px] h-[22px]" style={{ color: isActive ? '#60A5FA' : '#6B7280' }} />
              <span className="text-[10px] font-medium" style={{ color: isActive ? '#60A5FA' : '#6B7280' }}>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sm:hidden h-16" />
    </>
  );
}
