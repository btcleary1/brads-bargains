// Google sign-in settings, cleaned and checked before anyone is sent to Google.
// A client ID is one line ending in .apps.googleusercontent.com; anything else (a pasted block,
// quotes, the secret by mistake) sends a broken address to Google, which shows its own 404 page.

function clean(name: string): string {
  let v = (process.env[name] ?? '').trim();
  if (v.startsWith(name + '=')) v = v.slice(name.length + 1).trim();
  return v.replace(/^["']|["']$/g, '').trim();
}

export type GoogleError = 'google_not_configured' | 'google_bad_client_id' | 'google_bad_app_url';

export function googleConfig(): { ok: true; clientId: string; secret: string; appUrl: string } | { ok: false; error: GoogleError } {
  const clientId = clean('GOOGLE_CLIENT_ID');
  const secret = clean('GOOGLE_CLIENT_SECRET');
  if (!clientId || !secret) return { ok: false, error: 'google_not_configured' };
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    console.error("GOOGLE_CLIENT_ID doesn't look like a Google client ID (one line ending in .apps.googleusercontent.com).");
    return { ok: false, error: 'google_bad_client_id' };
  }
  let appUrl = 'https://brads-bargains.vercel.app';
  const raw = clean('NEXT_PUBLIC_APP_URL');
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:' && u.hostname !== 'localhost') throw new Error('not https');
      appUrl = u.origin;
    } catch {
      console.error("NEXT_PUBLIC_APP_URL isn't a web address like https://brads-bargains.vercel.app.");
      return { ok: false, error: 'google_bad_app_url' };
    }
  }
  return { ok: true, clientId, secret, appUrl };
}

// Turns Google's token error into a reason the login page can explain.
export function tokenErrorCode(body: string): string {
  if (/invalid_client|unauthorized_client/.test(body)) return 'google_bad_secret';
  if (/redirect_uri_mismatch/.test(body)) return 'google_redirect_mismatch';
  return 'google_failed';
}

export const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: "Google sign-in didn't work. Try again.",
  google_not_configured: "Google sign-in isn't set up yet. Use your email and password for now.",
  google_bad_client_id: 'Google sign-in is set up wrong: GOOGLE_CLIENT_ID in Vercel must be just the client ID, one line ending in .apps.googleusercontent.com.',
  google_bad_app_url: "Google sign-in is set up wrong: NEXT_PUBLIC_APP_URL in Vercel must be this site's address, like https://brads-bargains.vercel.app.",
  google_bad_secret: "Google didn't accept this app's client secret. GOOGLE_CLIENT_SECRET in Vercel must match the OAuth client in Google Cloud (it changes if the secret was reset).",
  google_redirect_mismatch: "Google doesn't have this site's address on file. Add it to the OAuth client's Authorized redirect URIs in Google Cloud.",
};
