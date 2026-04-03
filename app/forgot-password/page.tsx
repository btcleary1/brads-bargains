'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok || data.success) {
        setMessage({ type: 'success', text: 'If that email has an account, a 6-digit code was sent. Check your inbox.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error — please try again.' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
          <p className="text-sm mt-1 text-center" style={{ color: '#6B7280' }}>Enter your email and we&apos;ll send a reset code</p>
        </div>

        <div className="rounded-2xl p-7" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {message && (
            <div className="rounded-xl px-3 py-2.5 text-xs mb-4" style={{
              background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: message.type === 'success' ? '#4ADE80' : '#F87171',
            }}>
              {message.text}
              {message.type === 'success' && (
                <button
                  onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
                  className="block mt-2 font-semibold underline"
                  style={{ color: '#60A5FA' }}
                >
                  Enter my reset code →
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6B7280' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)' }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Reset Code
            </button>
          </form>

          <p className="text-center text-xs mt-5" style={{ color: '#6B7280' }}>
            Remembered it?{' '}
            <Link href="/login" className="font-medium" style={{ color: '#60A5FA' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
