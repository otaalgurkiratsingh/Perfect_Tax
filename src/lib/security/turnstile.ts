import "server-only";
import { env } from "@/lib/env";

/**
 * Verify a Cloudflare Turnstile token. Without a secret key configured the
 * check is skipped only for local development/testing; everywhere else it fails closed.
 */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = env.turnstileSecret;
  if (!secret) return env.isLocalTesting;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
