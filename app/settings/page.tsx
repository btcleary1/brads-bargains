'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Fingerprint, Loader2, Eye, EyeOff, Trash2, KeyRound, Bell, BookmarkPlus, X, Plus, SlidersHorizontal } from 'lucide-react';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import Header from '@/components/Header';

export default function SettingsPage() {
  const router = useRouter();

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

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistMessage, setWatchlistMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [digestCount, setDigestCount] = useState<number>(5);
  const [digestCategories, setDigestCategories] = useState<string[]>([]);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [emailPrefsMessage, setEmailPrefsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : Promise.reject()).then((me: any) => {
      if (me.googleAuth) setIsGoogleAuth(true);
      // Pre-populate notification email with Gmail if not already saved
      fetch('/api/prefs').then(r => r.ok ? r.json() : {}).then((p: any) => {
        setNotifEmail(p.notificationEmail || me.email || '');
        if (p.watchlistQueries) setWatchlist(p.watchlistQueries);
        if (p.digestCount) setDigestCount(p.digestCount);
        if (p.digestCategories) setDigestCategories(p.digestCategories);
      }).catch(() => {});
    }).catch(() => router.replace('/login'));
    setSupportsWebAuthn(browserSupportsWebAuthn());
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setBiometricLabel('Face ID');
    else if (/Mac/.test(ua) || /CrOS/.test(ua) || /Win/.test(ua)) setBiometricLabel('Fingerprint / Touch ID');
    fetchStatus();
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
                <button
                  onClick={handleEnable}
                  disabled={authLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}
                >
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                  Register this device
                </button>
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
              { label: 'Current Password', value: cpCurrent, onChange: setCpCurrent, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
              { label: 'New Password', value: cpNew, onChange: setCpNew, show: showNew, toggle: () => setShowNew(v => !v) },
              { label: 'Confirm New Password', value: cpConfirm, onChange: setCpConfirm, show: showNew, toggle: () => setShowNew(v => !v) },
            ].map(({ label, value, onChange, show, toggle }) => (
              <div key={label}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>{label}</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
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
