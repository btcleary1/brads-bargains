'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, Fingerprint, Loader2, Eye, EyeOff, Trash2, KeyRound, Bell, BookmarkPlus, X, Plus, SlidersHorizontal, Link, Link2Off } from 'lucide-react';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import Header from '@/components/Header';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [registered, setRegistered] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');

  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpMessage, setCpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [isGoogleAuth, setIsGoogleAuth] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  const [notifEmail, setNotifEmail] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistMessage, setWatchlistMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [digestCount, setDigestCount] = useState<number>(5);
  const [digestCategories, setDigestCategories] = useState<string[]>([]);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [emailPrefsMessage, setEmailPrefsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ebayConnected, setEbayConnected] = useState<boolean | null>(null);
  const [ebayMessage, setEbayMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [priceMin, setPriceMin] = useState<number | ''>('');
  const [priceMax, setPriceMax] = useState<number | ''>('');
  const [priceRangeLoading, setPriceRangeLoading] = useState(false);
  const [priceRangeMessage, setPriceRangeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [defaultMinProfit, setDefaultMinProfit] = useState<number | ''>('');
  const [defaultMinDiscount, setDefaultMinDiscount] = useState<number | ''>('');
  const [defaultSingleQtyOnly, setDefaultSingleQtyOnly] = useState(false);
  const [dealFiltersLoading, setDealFiltersLoading] = useState(false);
  const [dealFiltersMessage, setDealFiltersMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (r.status === 401) { router.replace('/login'); return Promise.reject('unauth'); }
      return r.json();
    }).then((me: any) => {
      if (me.googleAuth) setIsGoogleAuth(true);
      // Pre-populate notification email with Gmail if not already saved
      fetch('/api/prefs').then(r => r.ok ? r.json() : {}).then((p: any) => {
        setNotifEmail(p.notificationEmail || me.email || '');
        if (p.watchlistQueries) setWatchlist(p.watchlistQueries);
        if (p.digestCount) setDigestCount(p.digestCount);
        if (p.digestCategories) setDigestCategories(p.digestCategories);
        if (p.defaultPriceMin != null) setPriceMin(p.defaultPriceMin);
        if (p.defaultPriceMax != null) setPriceMax(p.defaultPriceMax);
        if (p.defaultMinProfit != null) setDefaultMinProfit(p.defaultMinProfit);
        if (p.defaultMinDiscount != null) setDefaultMinDiscount(p.defaultMinDiscount);
        if (p.defaultSingleQtyOnly != null) setDefaultSingleQtyOnly(p.defaultSingleQtyOnly);
      }).catch(() => {});
      fetch('/api/auth/ebay/status').then(r => r.ok ? r.json() : {}).then((d: any) => setEbayConnected(!!d.connected)).catch(() => setEbayConnected(false));
    }).catch((e) => { if (e !== 'unauth') { /* network error — stay on page */ } });

    const ebayParam = searchParams.get('ebay');
    if (ebayParam === 'connected') setEbayMessage({ type: 'success', text: 'eBay account connected! Your purchase history will now personalize your recommendations.' });
    else if (ebayParam === 'error') {
      const reason = searchParams.get('reason');
      setEbayMessage({ type: 'error', text: reason ? `eBay error: ${reason}` : 'eBay connection failed. Please try again.' });
    }
    setSupportsWebAuthn(browserSupportsWebAuthn());
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setBiometricLabel('Face ID');
    else if (/Mac/.test(ua) || /CrOS/.test(ua) || /Win/.test(ua)) setBiometricLabel('Fingerprint / Touch ID');
    fetchStatus();

    // Check push notification support and current permission
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
          reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub));
        });
      }
    }
  }, [router]);

  const fetchStatus = async () => {
    const res = await fetch('/api/auth/webauthn/status');
    const data = await res.json();
    setRegistered(data.registered);
  };

  const handleEnable = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const optRes = await fetch('/api/auth/webauthn/register-options', { method: 'POST' });
      const options = await optRes.json();
      if (!optRes.ok) {
        setAuthMessage({ type: 'error', text: options.error || 'Failed to start registration.' });
        setAuthLoading(false);
        return;
      }
      const attestation = await startRegistration({ optionsJSON: options });
      const verRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      });
      if (verRes.ok) {
        setRegistered(true);
        setAuthMessage({ type: 'success', text: `${biometricLabel} enabled.` });
      } else {
        const d = await verRes.json();
        setAuthMessage({ type: 'error', text: d.error || 'Registration failed.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setAuthMessage({ type: 'error', text: msg });
    }
    setAuthLoading(false);
  };

  const handleDisable = async () => {
    if (!confirm(`Remove ${biometricLabel} from all devices?`)) return;
    setAuthLoading(true);
    setAuthMessage(null);
    const res = await fetch('/api/auth/webauthn/delete', { method: 'POST' });
    if (res.ok) {
      setRegistered(false);
      setAuthMessage({ type: 'success', text: `${biometricLabel} disabled.` });
    } else {
      setAuthMessage({ type: 'error', text: 'Failed to disable.' });
    }
    setAuthLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cpNew !== cpConfirm) { setCpMessage({ type: 'error', text: 'New passwords do not match.' }); return; }
    setCpLoading(true);
    setCpMessage(null);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
    });
    const data = await res.json();
    if (res.ok) {
      setCpMessage({ type: 'success', text: 'Password updated.' });
      setCpCurrent(''); setCpNew(''); setCpConfirm('');
    } else {
      setCpMessage({ type: 'error', text: data.error || 'Failed to update password.' });
    }
    setCpLoading(false);
  };

  const handleSaveNotifEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifLoading(true);
    setNotifMessage(null);
    try {
      const res = await fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmail: notifEmail.trim() || null }),
      });
      if (res.ok) {
        setNotifMessage({ type: 'success', text: 'Alert email saved.' });
      } else {
        const d = await res.json();
        setNotifMessage({ type: 'error', text: d.error || 'Failed to save.' });
      }
    } catch {
      setNotifMessage({ type: 'error', text: 'Network error.' });
    }
    setNotifLoading(false);
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushMessage({ type: 'error', text: 'Permission denied. Enable notifications in your browser settings.' });
        setPushLoading(false);
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'BOuoW_7q_n1PHvl-GsSmqYpOd9P9Gqxfe51zfuvO84r_CaRVU9A529QivYvBUy6Ml7MahUX_S2lBOzS1ObjeM08',
      });
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });
      setPushEnabled(true);
      setPushMessage({ type: 'success', text: 'Deal notifications enabled!' });
    } catch (err: any) {
      setPushMessage({ type: 'error', text: err.message || 'Failed to enable notifications.' });
    }
    setPushLoading(false);
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push-subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      setPushMessage({ type: 'success', text: 'Notifications disabled.' });
    } catch (err: any) {
      setPushMessage({ type: 'error', text: err.message || 'Failed to disable notifications.' });
    }
    setPushLoading(false);
  };

  const handleTestPush = async () => {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const res = await fetch('/api/push-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: "Brad's Bargains", body: "🔥 Test notification — deal alerts are working!", url: '/deals' }),
      });
      const d = await res.json();
      if (res.ok) setPushMessage({ type: 'success', text: 'Test notification sent!' });
      else setPushMessage({ type: 'error', text: d.error || 'Failed to send.' });
    } catch { setPushMessage({ type: 'error', text: 'Network error.' }); }
    setPushLoading(false);
  };

  const saveWatchlist = async (updated: string[]) => {
    setWatchlistLoading(true);
    setWatchlistMessage(null);
    try {
      const res = await fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlistQueries: updated }),
      });
      if (res.ok) {
        setWatchlist(updated);
        setWatchlistMessage({ type: 'success', text: 'Watchlist saved.' });
        setTimeout(() => setWatchlistMessage(null), 3000);
      }
    } catch { setWatchlistMessage({ type: 'error', text: 'Failed to save.' }); }
    setWatchlistLoading(false);
  };

  const saveEmailPrefs = async (count: number, categories: string[]) => {
    setEmailPrefsLoading(true);
    setEmailPrefsMessage(null);
    try {
      const res = await fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digestCount: count, digestCategories: categories }),
      });
      if (res.ok) {
        setEmailPrefsMessage({ type: 'success', text: 'Email preferences saved.' });
        setTimeout(() => setEmailPrefsMessage(null), 3000);
      } else {
        setEmailPrefsMessage({ type: 'error', text: 'Failed to save.' });
      }
    } catch { setEmailPrefsMessage({ type: 'error', text: 'Network error.' }); }
    setEmailPrefsLoading(false);
  };

  const toggleCategory = (key: string) => {
    const updated = digestCategories.includes(key)
      ? digestCategories.filter(k => k !== key)
      : [...digestCategories, key];
    setDigestCategories(updated);
    saveEmailPrefs(digestCount, updated);
  };

  const addWatchlistItem = () => {
    const term = watchlistInput.trim();
    if (!term || watchlist.includes(term)) return;
    const updated = [...watchlist, term];
    setWatchlistInput('');
    saveWatchlist(updated);
  };

  const removeWatchlistItem = (term: string) => saveWatchlist(watchlist.filter(t => t !== term));

  const saveDealFilters = async () => {
    setDealFiltersLoading(true);
    setDealFiltersMessage(null);
    try {
      const res = await fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultMinProfit: defaultMinProfit === '' ? null : defaultMinProfit,
          defaultMinDiscount: defaultMinDiscount === '' ? null : defaultMinDiscount,
          defaultSingleQtyOnly,
        }),
      });
      if (res.ok) {
        setDealFiltersMessage({ type: 'success', text: 'Default deal filters saved.' });
        setTimeout(() => setDealFiltersMessage(null), 3000);
      } else {
        setDealFiltersMessage({ type: 'error', text: 'Failed to save.' });
      }
    } catch {
      setDealFiltersMessage({ type: 'error', text: 'Network error.' });
    }
    setDealFiltersLoading(false);
  };

  const savePriceRange = async () => {
    setPriceRangeLoading(true);
    setPriceRangeMessage(null);
    try {
      const res = await fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultPriceMin: priceMin === '' ? null : priceMin,
          defaultPriceMax: priceMax === '' ? null : priceMax,
        }),
      });
      if (res.ok) {
        setPriceRangeMessage({ type: 'success', text: 'Default price range saved.' });
        setTimeout(() => setPriceRangeMessage(null), 3000);
      } else {
        setPriceRangeMessage({ type: 'error', text: 'Failed to save.' });
      }
    } catch {
      setPriceRangeMessage({ type: 'error', text: 'Network error.' });
    }
    setPriceRangeLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Permanently delete your account and all your data? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure?')) return;
    setDeleteAccountLoading(true);
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE' });
      if (res.ok) {
        router.push('/login');
      } else {
        const d = await res.json().catch(() => ({}));
        alert('Delete failed: ' + (d.error || `HTTP ${res.status}. Try refreshing and signing in again.`));
      }
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    } finally { setDeleteAccountLoading(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <Header />
      <div className="max-w-xl mx-auto px-4 py-6 pb-24 sm:pb-10">

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl shrink-0" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}>
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-xs" style={{ color: '#6B7280' }}>Manage your account</p>
          </div>
        </div>

        {/* Biometrics */}
        {supportsWebAuthn && (
          <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Fingerprint className="w-5 h-5" style={{ color: '#60A5FA' }} />
              <h2 className="font-semibold text-white text-[15px]">{biometricLabel} Sign-In</h2>
            </div>
            {authMessage && (
              <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: authMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${authMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: authMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
                {authMessage.text}
              </div>
            )}
            {registered === null ? (
              <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin" style={{ color: '#6B7280' }} /></div>
            ) : registered ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ADE80' }}>
                  <Fingerprint className="w-3.5 h-3.5 shrink-0" />
                  {biometricLabel} enabled on this device
                </div>
                <button
                  onClick={handleDisable}
                  disabled={authLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}
                >
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Disable all devices`}
                </button>
              </div>
            ) : (
              <button
                onClick={handleEnable}
                disabled={authLoading}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                Enable {biometricLabel}
              </button>
            )}
          </div>
        )}

        {/* Change password — hidden for Google OAuth users */}
        {!isGoogleAuth && <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Change Password</h2>
          </div>
          {cpMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: cpMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${cpMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: cpMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {cpMessage.text}
            </div>
          )}
          <form onSubmit={handleChangePassword} className="space-y-3">
            {[
              { label: 'Current Password', value: cpCurrent, onChange: setCpCurrent, show: showCurrent, toggle: () => setShowCurrent(v => !v), autoComplete: 'current-password' },
              { label: 'New Password', value: cpNew, onChange: setCpNew, show: showNew, toggle: () => setShowNew(v => !v), autoComplete: 'new-password' },
              { label: 'Confirm New Password', value: cpConfirm, onChange: setCpConfirm, show: showNew, toggle: () => setShowNew(v => !v), autoComplete: 'new-password' },
            ].map(({ label, value, onChange, show, toggle, autoComplete }) => (
              <div key={label}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>{label}</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    autoComplete={autoComplete}
                    required
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: '#6B7280', minHeight: 'unset' }}>
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            <button
              type="submit"
              disabled={cpLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
            >
              {cpLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Password
            </button>
          </form>
        </div>}

        {/* eBay Account */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Link className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Connect eBay Account</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: '#6B7280' }}>Link your eBay account to personalize Today&apos;s Picks and your daily email based on your purchase history.</p>
          {ebayMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: ebayMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${ebayMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: ebayMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {ebayMessage.text}
            </div>
          )}
          {ebayConnected === null ? (
            <div className="flex items-center gap-2 py-1"><Loader2 className="w-4 h-4 animate-spin" style={{ color: '#6B7280' }} /></div>
          ) : ebayConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm" style={{ color: '#4ADE80' }}>
                <Link className="w-4 h-4" />
                eBay account connected
              </div>
              <button
                onClick={async () => {
                  const res = await fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ebayAccessToken: null, ebayRefreshToken: null, ebayTokenExpiresAt: null }) });
                  if (res.ok) { setEbayConnected(false); setEbayMessage({ type: 'success', text: 'eBay account disconnected.' }); }
                }}
                className="text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}
              >
                <Link2Off className="w-3 h-3" /> Disconnect
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/ebay"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}
            >
              <Link className="w-4 h-4" />
              Connect eBay Account
            </a>
          )}
        </div>

        {/* Deal alerts */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Deal Alert Email</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: '#6B7280' }}>Where to send hot deal notifications when you search with alerts on.</p>
          {notifMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: notifMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${notifMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: notifMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {notifMessage.text}
            </div>
          )}
          <form onSubmit={handleSaveNotifEmail} className="flex gap-2">
            <input
              type="email"
              value={notifEmail}
              onChange={e => setNotifEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button
              type="submit"
              disabled={notifLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
            >
              {notifLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </form>
        </div>

        {/* Push Notifications */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Deal Notifications</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: '#6B7280' }}>Get instant push notifications for hot deals — works on Chrome, Android, and desktop.</p>
          {pushMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: pushMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${pushMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: pushMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {pushMessage.text}
            </div>
          )}
          {!pushSupported ? (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280' }}>
              Push notifications aren&apos;t supported in this browser. Try Chrome or add this site to your home screen on iOS.
            </div>
          ) : pushEnabled ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ADE80' }}>
                <Bell className="w-3.5 h-3.5 shrink-0" />
                Notifications enabled on this device
              </div>
              <button
                onClick={handleTestPush}
                disabled={pushLoading}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#60A5FA' }}
              >
                {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Send Test Notification
              </button>
              <button
                onClick={handleDisablePush}
                disabled={pushLoading}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}
              >
                Disable Notifications
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnablePush}
              disabled={pushLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}
            >
              {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Enable Deal Notifications
            </button>
          )}
        </div>

        {/* Daily Watchlist */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <BookmarkPlus className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">My Daily Watchlist</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: '#6B7280' }}>Keywords your daily email will search. Leave empty to use default categories.</p>
          {watchlistMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: watchlistMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${watchlistMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: watchlistMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {watchlistMessage.text}
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={watchlistInput}
              onChange={e => setWatchlistInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addWatchlistItem())}
              placeholder="e.g. Air Jordan, Pokemon PSA, MacBook"
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button
              onClick={addWatchlistItem}
              disabled={watchlistLoading || !watchlistInput.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center gap-1"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
            >
              {watchlistLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
          {watchlist.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {watchlist.map(term => (
                <span key={term} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#93C5FD' }}>
                  {term}
                  <button onClick={() => removeWatchlistItem(term)} style={{ color: '#6B7280', minHeight: 'unset' }}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: '#4B5563' }}>No keywords yet — using default categories.</p>
          )}
        </div>

        {/* Email Preferences */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Email Preferences</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: '#6B7280' }}>Customize how many deals you receive and which categories to include.</p>

          {emailPrefsMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: emailPrefsMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${emailPrefsMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: emailPrefsMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {emailPrefsMessage.text}
            </div>
          )}

          {/* Deal count */}
          <div className="mb-4">
            <label className="block text-xs font-medium mb-2" style={{ color: '#9CA3AF' }}>Deals per email</label>
            <div className="flex gap-2">
              {[3, 5, 10].map(n => (
                <button
                  key={n}
                  onClick={() => { setDigestCount(n); saveEmailPrefs(n, digestCategories); }}
                  disabled={emailPrefsLoading}
                  className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: digestCount === n ? 'linear-gradient(135deg,#3B82F6,#6366F1)' : 'rgba(255,255,255,0.06)',
                    border: digestCount === n ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    color: digestCount === n ? '#fff' : '#9CA3AF',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: '#9CA3AF' }}>
              Categories {digestCategories.length === 0 ? <span style={{ color: '#4B5563' }}>(all included)</span> : <span style={{ color: '#60A5FA' }}>({digestCategories.length} selected)</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              {DIGEST_CATEGORIES.map(cat => {
                const active = digestCategories.includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleCategory(cat.key)}
                    disabled={emailPrefsLoading}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                    style={{
                      background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                      border: active ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: active ? '#60A5FA' : '#6B7280',
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
            {digestCategories.length > 0 && (
              <button
                onClick={() => { setDigestCategories([]); saveEmailPrefs(digestCount, []); }}
                className="mt-2 text-xs"
                style={{ color: '#4B5563' }}
              >
                Clear — use all categories
              </button>
            )}
          </div>
        </div>

        {/* Default Price Range */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Default Price Range</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: '#6B7280' }}>Pre-fill min/max price in Find Deals on every search.</p>
          {priceRangeMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: priceRangeMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${priceRangeMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: priceRangeMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {priceRangeMessage.text}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={priceMin}
              onChange={e => setPriceMin(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
              placeholder="$ min"
              className="w-28 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <span className="text-sm" style={{ color: '#6B7280' }}>–</span>
            <input
              type="number"
              min={0}
              value={priceMax}
              onChange={e => setPriceMax(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
              placeholder="$ max"
              className="w-28 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button
              onClick={savePriceRange}
              disabled={priceRangeLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
            >
              {priceRangeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
            {(priceMin !== '' || priceMax !== '') && (
              <button
                onClick={() => { setPriceMin(''); setPriceMax(''); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ color: '#6B7280', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Default Deal Filters */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="w-5 h-5" style={{ color: '#60A5FA' }} />
            <h2 className="font-semibold text-white text-[15px]">Default Deal Filters</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: '#6B7280' }}>Pre-fill min profit and min % off in Find Deals on every search.</p>
          {dealFiltersMessage && (
            <div className="rounded-xl px-3 py-2 text-xs mb-3" style={{ background: dealFiltersMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${dealFiltersMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: dealFiltersMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>
              {dealFiltersMessage.text}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs shrink-0" style={{ color: '#9CA3AF' }}>Min profit $:</span>
            <input
              type="number"
              min={0}
              value={defaultMinProfit}
              onChange={e => setDefaultMinProfit(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
              placeholder="any"
              className="w-24 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <span className="text-xs shrink-0" style={{ color: '#9CA3AF' }}>Min % off:</span>
            <input
              type="number"
              min={0}
              max={100}
              value={defaultMinDiscount}
              onChange={e => setDefaultMinDiscount(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))}
              placeholder="any"
              className="w-24 px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button
              onClick={saveDealFilters}
              disabled={dealFiltersLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
            >
              {dealFiltersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setDefaultSingleQtyOnly(v => !v)}
              className="text-xs px-3 py-2.5 rounded-xl font-medium transition-all"
              style={{
                background: defaultSingleQtyOnly ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                border: defaultSingleQtyOnly ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: defaultSingleQtyOnly ? '#4ADE80' : '#9CA3AF',
              }}
            >
              {defaultSingleQtyOnly ? '✓ ' : ''}Single qty only
            </button>
            <button
              onClick={saveDealFilters}
              disabled={dealFiltersLoading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
            >
              {dealFiltersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
            {(defaultMinProfit !== '' || defaultMinDiscount !== '' || defaultSingleQtyOnly) && (
              <button
                onClick={() => { setDefaultMinProfit(''); setDefaultMinDiscount(''); setDefaultSingleQtyOnly(false); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ color: '#6B7280', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h2 className="font-semibold text-red-400 text-[15px]">Danger Zone</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: '#9CA3AF' }}>Permanently deletes your account and all tracked deals. This cannot be undone.</p>
          <button
            onClick={handleDeleteAccount}
            disabled={deleteAccountLoading}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}
          >
            {deleteAccountLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete My Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
