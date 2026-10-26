import "server-only";

// Server-side environment access. Values come from the deployment environment
// (Netlify) — see .env.example for the full list. Nothing secret is committed.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get siteUrl() {
    return required("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
  },
  get sinEncryptionKey() {
    return required("SIN_ENCRYPTION_KEY");
  },
  get linkSigningSecret() {
    return required("LINK_SIGNING_SECRET");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get turnstileSecret() {
    return optional("TURNSTILE_SECRET_KEY");
  },
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get twilio() {
    return {
      accountSid: optional("TWILIO_ACCOUNT_SID"),
      authToken: optional("TWILIO_AUTH_TOKEN"),
      smsFrom: optional("TWILIO_SMS_FROM"),
      messagingServiceSid: optional("TWILIO_MESSAGING_SERVICE_SID"),
      whatsappFrom: optional("TWILIO_WHATSAPP_FROM"),
    };
  },
  /** "live" sends real messages. Anything else (or missing provider keys) logs a dry run. */
  get messagingMode(): "live" | "dry_run" {
    return process.env.MESSAGING_MODE === "live" ? "live" : "dry_run";
  },
  /** Local development/test only: write full dry-run messages here so tests can follow links. */
  get devOutboxDir() {
    return this.isLocalTesting ? optional("DEV_OUTBOX_DIR") : undefined;
  },
  /**
   * True only in `next dev` or when INSECURE_LOCAL_TESTING=1 is set for the local
   * end-to-end test run. Relaxes Turnstile (no key) and enables the dev outbox.
   * Never set INSECURE_LOCAL_TESTING on Netlify.
   */
  get isLocalTesting() {
    return process.env.NODE_ENV === "development" || process.env.INSECURE_LOCAL_TESTING === "1";
  },
};
