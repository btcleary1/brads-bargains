// Cloudflare Turnstile: a free, invisible "are you a person?" check on the login, sign-up and
// reset forms (Cleary suite security baseline, docs/CLEARY_SUITE.md in Cleary Trading). The browser
// widget gives a one-time token; this checks it with Cloudflare before the route does anything else.
// Skipped until both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set, then enforced.
const env = (n: string) => (process.env[n] || "").trim() || undefined;

export function turnstileOn(): boolean {
  return Boolean(env("TURNSTILE_SECRET_KEY") && env("NEXT_PUBLIC_TURNSTILE_SITE_KEY"));
}

export const HUMAN_CHECK_FAILED = "Couldn't confirm you're a person. Wait for the check above the button, then try again.";

export async function verifyHuman(token: unknown, ip: string): Promise<boolean> {
  if (!turnstileOn()) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: env("TURNSTILE_SECRET_KEY")!, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("Turnstile check failed:", err);
    return false; // enforced: if Cloudflare can't be reached, refuse rather than let bots through
  }
}

// Hidden "website" field on auth forms. People never see it; simple bots fill it in.
export const isBotTrap = (v: unknown) => typeof v === "string" && v.trim().length > 0;
