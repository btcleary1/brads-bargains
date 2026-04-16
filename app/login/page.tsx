'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Sign in with Biometrics');
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState('');

  useEffect(() => {
    setSupportsWebAuthn(browserSupportsWebAuthn());
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setBiometricLabel('Sign in with Face ID');
    else if (/Mac/.test(ua) && !/CrOS/.test(ua)) setBiometricLabel('Sign in with Touch ID');
    else if (/CrOS/.test(ua)) setBiometricLabel('Sign in with Screen Lock');
    else if (/Win/.test(ua)) setBiometricLabel('Sign in with Windows Hello');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/deals');
      } else {
        setError(data.error || 'Incorrect email or password.');
      }
    } catch {
      setError('Network error — please try again.');
    }
    setLoading(false);
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setBiometricError('');
    try {
      const optRes = await fetch('/api/auth/webauthn/auth-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const options = await optRes.json();
      if (!optRes.ok) { setBiometricError(options.error); setBiometricLoading(false); return; }
      const assertion = await startAuthentication({ optionsJSON: options, useBrowserAutofill: false });
      const verRes = await fetch('/api/auth/webauthn/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      });
      const result = await verRes.json();
      if (verRes.ok) {
        router.push('/deals');
      } else {
        setBiometricError(result.error || 'Biometric sign-in failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowedError') || msg.includes('cancelled') || msg.includes('not allowed')) {
        setBiometricError('No passkey found. Sign in with email, then enable Touch ID in Settings.');
      } else {
        setBiometricError(msg);
      }
    }
    setBiometricLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Brad&apos;s Bargains</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Find the best eBay deals</p>
        </div>

        {/* Biometric button */}
        {supportsWebAuthn && (
          <div className="mb-5">
            <button
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
              className="w-full py-3.5 font-semibold text-sm flex items-center justify-center gap-2.5 rounded-2xl transition-all disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.13)', color: 'white' }}
            >
              {biometricLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Fingerprint className="w-4 h-4 text-blue-400" />}
              {biometricLoading ? 'Verifying…' : biometricLabel}
            </button>
            {biometricError && (
              <p className="mt-2 text-xs text-red-400 text-center">{biometricError}</p>
            )}
          </div>
        )}

        {/* Google button */}
        <div className="mb-5">
          <a
            href="/api/auth/google"
            className="w-full py-3.5 font-semibold text-sm flex items-center justify-center gap-2.5 rounded-2xl transition-all"
            style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.13)', color: 'white', textDecoration: 'none' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </a>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <span className="text-[11px] text-gray-500 tracking-wide uppercase">or sign in with email</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <div className="glass-card p-7">
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

            {error && (
              <p className="text-xs text-center py-2 px-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
                {error}
              </p>
            )}

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
