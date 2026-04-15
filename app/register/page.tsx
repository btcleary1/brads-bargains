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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    const data = await res.json();
    if (res.ok) {
      router.push('/deals');
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
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Brad&apos;s Bargains</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Create your account — find the best eBay deals</p>
        </div>

        <div className="glass-card p-7">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="First name"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
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
                  autoComplete="new-password"
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
              {/* Requirements */}
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

            {error && <p className="text-xs text-center py-2 px-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)' }}
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
