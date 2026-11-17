"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile widget for the login, sign-up and reset forms (see lib/turnstile.ts).
// Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Tokens work once, so call
// reset() after every submit. Also renders the hidden bot-trap field.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
export const humanCheckOn = Boolean(SITE_KEY);

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("Turnstile didn't load"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export type HumanCheckHandle = { reset: () => void };

const HumanCheck = forwardRef<HumanCheckHandle, { onToken: (token: string) => void; action: string }>(function HumanCheck({ onToken, action }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | undefined>(undefined);
  const cb = useRef(onToken);
  cb.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      cb.current("");
      if (id.current && window.turnstile) window.turnstile.reset(id.current);
    },
  }));

  useEffect(() => {
    if (!SITE_KEY) return;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          action,
          theme: "auto",
          size: "flexible",
          appearance: "interaction-only",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
          "error-callback": () => cb.current(""),
        });
      })
      .catch(() => cb.current(""));
    return () => {
      gone = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = undefined;
    };
  }, [action]);

  return (
    <>
      {SITE_KEY && <div ref={box} style={{ minHeight: 0 }} />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" defaultValue="" style={{ position: "absolute", left: -10000, width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
    </>
  );
});

export default HumanCheck;
