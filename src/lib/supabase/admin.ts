import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role client. Bypasses RLS — only ever used in server code AFTER the
// caller has been authorized (staff session, valid access token, or cron secret).
let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
}

export const DOCUMENTS_BUCKET = "documents";
