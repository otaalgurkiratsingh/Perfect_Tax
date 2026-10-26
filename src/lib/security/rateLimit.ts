import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limit stored in Postgres so it holds across serverless
 * instances. Fails closed: if the check itself errors, the request is refused.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await adminClient().rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.message);
    return false;
  }
  return data === true;
}

export const LIMITS = {
  intakeStart: { limit: 10, window: 3600 },
  intakeSave: { limit: 300, window: 600 },
  intakeSubmit: { limit: 10, window: 3600 },
  uploadSign: { limit: 60, window: 600 },
  publicRead: { limit: 120, window: 600 },
  staffLoginIp: { limit: 20, window: 900 },
  staffLoginEmail: { limit: 5, window: 900 },
  portalLoginIp: { limit: 10, window: 900 },
  portalLoginEmail: { limit: 3, window: 900 },
  unsubscribe: { limit: 30, window: 600 },
} as const;
