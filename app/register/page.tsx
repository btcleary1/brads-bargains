'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2, Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { PASSWORD_REQUIREMENTS } from '@/lib/password-rules';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const allChecksPassed = PASSWORD_REQUIREMENTS.every(r => r.test(password));
  const canSubmit = agreed && allChecksPassed && !loading;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { setError('You must agree to the Terms and Privacy Policy.'); return; }
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = '/deals';
    } else {
      setError(data.error || 'Registration failed.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: '#0D1B2A', boxShadow: '0 4px 20px rgba(13,27,42,0.7)' }}>
            <svg width="28" height="28" viewBox="0 0 18 18" aria-hidden="true">
              <defs>
                <linearGradient id="aif-reg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="50%" stopColor="#10B981"/>
                  <stop offset="50%" stopColor="#1D4ED8"/>
                </linearGradient>
              </defs>
              <polygon points="9,2 4.5,7.4 6.85,7.4 6.85,15.5 11.15,15.5 11.15,7.4 13.5,7.4" fill="url(#aif-reg)"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">AI FLIP</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Create your account — find the best eBay deals</p>
        </div>

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
            Continue with Google
          </a>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <span className="text-[11px] text-gray-500 tracking-wide uppercase">or create with email</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <div className="glass-card p-7">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="First name"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-gray-900 bg-white/95 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 border-0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-gray-900 bg-white/95 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 border-0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm text-gray-900 bg-white/95 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 border-0"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  style={{ minHeight: 'unset' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  {PASSWORD_REQUIREMENTS.map((req, i) => {
                    const met = req.test(password);
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {met
                          ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-400" />
                          : <Circle className="w-3.5 h-3.5 shrink-0" style={{ color: '#4B5563' }} />}
                        <span style={{ color: met ? '#86EFAC' : '#6B7280' }}>{req.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 shrink-0 rounded"
                style={{ minHeight: 'unset', accentColor: '#3B82F6' }}
              />
              <span className="text-[11px] text-gray-400 leading-relaxed">
                I will use AI FLIP for personal, lawful purposes only. I understand it uses eBay listing data for price comparison and is{' '}
                <strong className="text-gray-300">not affiliated with eBay</strong>. I agree to the{' '}
                <a href="/terms" target="_blank" className="text-blue-400 hover:underline">Terms</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" className="text-blue-400 hover:underline">Privacy Policy</a>.
              </span>
            </label>

            {error && <p className="text-xs text-center py-2 px-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canSubmit ? 'linear-gradient(135deg,#3B82F6,#6366F1)' : 'rgba(59,130,246,0.5)', boxShadow: canSubmit ? '0 4px 16px rgba(99,102,241,0.35)' : 'none' }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Account
            </button>
          </form>

          <p className="text-center text-xs mt-5" style={{ color: '#6B7280' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-medium" style={{ color: '#60A5FA' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
