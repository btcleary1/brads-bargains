'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Fingerprint, Loader2, Eye, EyeOff } from 'lucide-react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import Link from 'next/link';

type Stage = 'login' | 'register-passkey';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [stage, setStage] = useState<Stage>('login');
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Sign in with Biometrics');

  useEffect(() => {
    setSupportsWebAuthn(browserSupportsWebAuthn());
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setBiometricLabel('Sign in with Face ID');
    else if (/Mac/.test(ua) && /Safari/.test(ua)) setBiometricLabel('Sign in with Touch ID');
    else if (/Win/.test(ua) || /CrOS/.test(ua)) setBiometricLabel('Sign in with Windows Hello');
    // Redirect already-logged-in users
    fetch('/api/auth/me').then(r => { if (r.ok) router.replace('/deals'); }).catch(() => {});
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      const statusRes = await fetch('/api/auth/webauthn/status');
      const statusData = await statusRes.json();
      if (statusData.registered) {
        router.push('/deals');
      } else {
        setStage('register-passkey');
      }
    } else {
      setError(data.error || 'Incorrect email or password.');
    }
    setLoading(false);
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setBiometricError('');
    try {
      const optRes = await fetch('/api/auth/webauthn/auth-options', { method: 'POST' });
      if (!optRes.ok) { setBiometricError('Biometric login unavailable — use password.'); setBiometricLoading(false); return; }
      const options = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verRes = await fetch('/api/auth/webauthn/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      });
      if (verRes.ok) {
        router.push('/deals');
      } else {
        const d = await verRes.json();
        setBiometricError(d.error || 'Biometric verification failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('cancel') && !msg.includes('abort')) setBiometricError(msg);
    }
    setBiometricLoading(false);
  };

  const handleSkipPasskey = async () => { router.push('/deals'); };

  const handleRegisterPasskey = async () => {
    setBiometricLoading(true);
    try {
      const optRes = await fetch('/api/auth/webauthn/register-options', { method: 'POST' });
      const options = await optRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      });
    } catch { /* passkey registration is optional */ }
    router.push('/deals');
  };

  // ── Register passkey prompt ──────────────────────────────────────────────────
  if (stage === 'register-passkey') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
        <div className="w-full max-w-sm glass-card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            <Fingerprint className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Enable Fast Sign-In</h2>
          <p className="text-sm mb-6" style={{ color: '#9CA3AF' }}>Use Face ID or fingerprint to sign in without a password next time.</p>
          <button
            onClick={handleRegisterPasskey}
            disabled={biometricLoading}
            className="w-full py-3 rounded-xl font-semibold text-white mb-3 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}
          >
            {biometricLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
            Enable Biometrics
          </button>
          <button onClick={handleSkipPasskey} className="w-full py-2 text-sm" style={{ color: '#6B7280' }}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // ── Main login ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Brad&apos;s Bargains</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Find eBay deals at 70%+ off</p>
        </div>

        <div className="glass-card p-7">
          {/* Biometric */}
          {supportsWebAuthn && (
            <div className="mb-5">
              <button
                onClick={handleBiometricLogin}
                disabled={biometricLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-all disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {biometricLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                {biometricLabel}
              </button>
              {biometricError && <p className="text-xs mt-2 text-center" style={{ color: '#F87171' }}>{biometricError}</p>}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <span className="text-xs" style={{ color: '#4B5563' }}>or use password</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: '#6B7280', minHeight: 'unset' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-center py-2 px-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)' }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>

          <div className="flex items-center justify-between mt-5">
            <Link href="/forgot-password" className="text-xs" style={{ color: '#60A5FA' }}>Forgot password?</Link>
            <p className="text-xs" style={{ color: '#6B7280' }}>
              No account?{' '}
              <Link href="/register" className="font-medium" style={{ color: '#60A5FA' }}>Create one free</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
