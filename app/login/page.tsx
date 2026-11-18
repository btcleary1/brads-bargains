'use client';

import SuiteMark from '@/components/SuiteMark';
import { useState, useEffect, useRef, Suspense } from 'react';
import HumanCheck, { humanCheckOn, type HumanCheckHandle } from '@/components/HumanCheck';
import { useRouter, useSearchParams } from 'next/navigation';
import { GOOGLE_ERRORS } from '@/lib/google-config';
import { Loader2 } from 'lucide-react';
import '../cleary-auth.css';
import { unlockName } from '@/lib/biometric';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import Link from 'next/link';

type Stage = 'login' | 'register-passkey';

function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = (() => {
    const r = searchParams.get('redirect') ?? '';
    return r.startsWith('/') && !r.startsWith('//') ? r : '/deals';
  })();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [humanToken, setHuman] = useState('');
  const human = useRef<HumanCheckHandle>(null);
  const [loading, setLoading] = useState(false);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Sign in with Biometrics');
  const [bio, setBio] = useState('fingerprint, face, or screen lock');
  useEffect(() => setBio(unlockName()), []);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [stage, setStage] = useState<Stage>('login');

  useEffect(() => {
    setSupportsWebAuthn(browserSupportsWebAuthn());
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setBiometricLabel('Sign in with Face ID');
    else if (/Mac/.test(ua) && !/CrOS/.test(ua)) setBiometricLabel('Sign in with Touch ID');
    else if (/CrOS/.test(ua)) setBiometricLabel('Sign in with Screen Lock');
    else if (/Win/.test(ua)) setBiometricLabel('Sign in with Windows Hello');

    // A Google sign-in that failed comes back with ?error=; say why.
    const gErr = searchParams.get('error') ?? '';
    if (GOOGLE_ERRORS[gErr]) setError(GOOGLE_ERRORS[gErr]);

    // After Google OAuth, check if passkey is already set up — offer setup if not
    if (searchParams.get('setup-passkey') === '1') {
      fetch('/api/auth/webauthn/status')
        .then(r => r.json())
        .then(d => {
          if (d.registered) {
            window.location.href = redirectTo;
          } else {
            setStage('register-passkey');
          }
        })
        .catch(() => router.push(redirectTo));
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trap = ((e.currentTarget as HTMLFormElement).elements.namedItem('website') as HTMLInputElement | null)?.value || '';
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstile: humanToken, website: trap }),
      });
      const data = await res.json();
      human.current?.reset();
      if (res.ok) {
        const statusRes = await fetch('/api/auth/webauthn/status');
        const statusData = await statusRes.json();
        if (statusData.registered) {
          window.location.href = redirectTo;
        } else {
          setStage('register-passkey');
        }
      } else {
        setError(data.error || 'Incorrect email or password.');
      }
    } catch {
      setError('Network error — please try again.');
    }
    setLoading(false);
  };

  const handleRegisterPasskey = async () => {
    setLoading(true);
    setError('');
    try {
      const optRes = await fetch('/api/auth/webauthn/register-options', { method: 'POST' });
      const options = await optRes.json();
      if (!optRes.ok) { setError(options.error || 'Could not start setup.'); setLoading(false); return; }
      const attestation = await startRegistration({ optionsJSON: options });
      const verRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      });
      const verData = await verRes.json();
      if (verRes.ok) {
        window.location.href = redirectTo;
      } else {
        setError(verData.error || 'Setup failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
    setLoading(false);
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setBiometricError('');
    try {
      const optRes = await fetch('/api/auth/webauthn/auth-options', { method: 'POST' });
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
        window.location.href = redirectTo;
      } else {
        setBiometricError(result.error || 'Biometric sign-in failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowedError') || msg.includes('cancelled') || msg.includes('not allowed')) {
        setBiometricError("No passkey for this app on this phone yet, or it was cancelled. Log in with Google or email once, and we'll offer to set up Face ID.");
      } else {
        setBiometricError(msg);
      }
    }
    setBiometricLoading(false);
  };


  if (stage === 'register-passkey') {
    return (
      <div className="cl-auth">
        <div className="cl-card">
          <div className="cl-icon-tile"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7zm1 3h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <h1>Create a passkey?</h1>
          <p className="cl-muted">Next time, log in with your {bio} on this device. No password to remember.</p>
          {error && <p role="alert" className="cl-error">{error}</p>}
          <button className="cl-btn primary" onClick={handleRegisterPasskey} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 cl-spin" /> : <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7zm1 3h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {loading ? 'Waiting for your device…' : 'Create a passkey'}
          </button>
          <button className="cl-btn ghost" onClick={() => router.push(redirectTo)}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cl-auth">
      <div className="cl-card">
        <span className="cl-logo" aria-hidden><SuiteMark size={52} /></span>
        <h1>Cleary eTrading</h1>
        <p className="cl-muted">Log in to find the best eBay deals</p>

        {error && <p role="alert" className="cl-error">{error}</p>}

        {supportsWebAuthn && (
          <div className="cl-passkey">
            <button className="cl-btn primary" onClick={handleBiometricLogin} disabled={biometricLoading}>
              {biometricLoading ? <Loader2 className="w-4 h-4 cl-spin" /> : <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7zm1 3h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              {biometricLoading ? 'Waiting for your device…' : 'Log in with a passkey'}
            </button>
            <span className="cl-muted cl-small">Use your {bio}</span>
            {biometricError && <p role="alert" className="cl-error">{biometricError}</p>}
          </div>
        )}

        <a className="cl-btn google" href={redirectTo !== '/deals' ? `/api/auth/google?redirect=${encodeURIComponent(redirectTo)}` : '/api/auth/google'}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div className="cl-divider"><span>or log in with email</span></div>

        <form onSubmit={handleLogin} className="cl-form">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="Email"
            autoComplete="username"
            autoCapitalize="none"
            inputMode="email"
            aria-label="Email"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
          />
          <HumanCheck ref={human} onToken={setHuman} action="login" />
          <button type="submit" className="cl-btn" disabled={!email || !password || loading || (humanCheckOn && !humanToken)}>
            {loading && <Loader2 className="w-4 h-4 cl-spin" />}
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <div className="cl-links">
          <Link href="/forgot-password" className="cl-link">Forgot password?</Link>
          <Link href="/register" className="cl-link">Create account</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPageWrapper() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
