'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Fingerprint, Loader2, Eye, EyeOff, Trash2, KeyRound } from 'lucide-react';
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

  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  useEffect(() => {
    setSupportsWebAuthn(browserSupportsWebAuthn());
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setBiometricLabel('Face ID');
    else if (/Mac/.test(ua) || /CrOS/.test(ua) || /Win/.test(ua)) setBiometricLabel('Fingerprint / Touch ID');
    fetchStatus();
  }, []);

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
    const res = await fetch('/api/auth/change-passphrase', {
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

  const handleDeleteAccount = async () => {
    if (!confirm('Permanently delete your account and all your data? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure?')) return;
    setDeleteAccountLoading(true);
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE' });
      if (res.ok) router.push('/login');
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
              <button
                onClick={handleDisable}
                disabled={authLoading}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Disable ${biometricLabel}`}
              </button>
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

        {/* Change password */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
