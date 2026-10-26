"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { ApiError, api } from "@/components/public/api";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

/**
 * The only page with a third-party script (Cloudflare Turnstile). No personal
 * information is typed here; after starting we do a full page load into the
 * form so the Turnstile script is gone before any answers are entered.
 */
export function StartForm({ kiosk, siteKey }: { kiosk: boolean; siteKey: string }) {
  const widget = useRef<HTMLDivElement>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [website, setWebsite] = useState("");

  useEffect(() => {
    if (!siteKey) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      if (widget.current && window.turnstile) {
        window.turnstile.render(widget.current, {
          sitekey: siteKey,
          callback: (t) => setCaptcha(t),
          "expired-callback": () => setCaptcha(null),
        });
      }
    };
    document.head.appendChild(script);
  }, [siteKey]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>("/api/intake/start", null, {
        method: "POST",
        body: { turnstileToken: captcha, website, kiosk },
      });
      let stored = false;
      try {
        if (kiosk) {
          window.sessionStorage.setItem("intake_kiosk", "1");
          window.sessionStorage.setItem("intake_token", token);
        } else {
          window.sessionStorage.removeItem("intake_kiosk");
          window.localStorage.setItem("intake_token", token);
        }
        stored = true;
      } catch {
        // Storage blocked (private mode): carry the token in the fragment instead.
      }
      // Full page load on purpose: it unloads the Turnstile script before any answers are typed.
      window.location.assign(stored ? "/intake" : `/intake#resume=${token}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {siteKey ? <div ref={widget} className="min-h-[65px]" /> : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 font-medium text-red-800">
          {error}
        </p>
      ) : null}
      <Button onClick={() => void start()} disabled={busy || (Boolean(siteKey) && !captcha)} className="w-full">
        {busy ? "Starting…" : "Start my form"}
      </Button>
    </div>
  );
}
