# BUILD REPORT — Client Intake System

Living report, updated after each phase. Final summary at the top once the build completes.

## Branch note

The brief asks for branch `claude/intake-build`. This session is restricted to pushing to
`claude/markdown-file-review-nosyqr`, so all phase commits are on that branch. Rename or
merge as you like.

## Phase log

### Phase 0 — Reconcile & scaffold
- `intake-source/` was empty → default field set used; every assumed field is listed in `FIELD_MAP.md`.
- Next.js 16 (App Router) + TypeScript + Tailwind v4 scaffolded. Supabase JS + SSR helpers installed.
- `firm.config.ts` = the ONE firm-specific file (branding, contacts, recipients, wording, consents,
  all message templates incl. WhatsApp, quarterly checklists). Firm-voice strings marked `[FIRM TO CONFIRM]`.
- `.env.example` lists variable names only.
- Database schema in `supabase/migrations/` (RLS on every table, private storage bucket, append-only audit log).
- `netlify.toml` skips every non-production build (no branch deploys / previews).

### Phase 1 — Public intake form
- `/start`: plain intro, "helpful to have nearby" list, safety points, honeypot + Cloudflare Turnstile + per-IP rate limit.
  Turnstile is the ONLY third-party script and lives only on `/start` (before any data is typed); the
  form itself is reached by a full page load, so no third-party code ever runs alongside client answers.
  `/start?kiosk=1` = office-tablet mode (token kept only for the tab; screen resets 60s after submit).
- `/intake`: 7-step mobile-first wizard (Who → Details → Services → Situation → Documents → Consents → Review)
  with progress bar, big tap targets, inline plain-language errors, branching by Individual / Couple /
  Business (sole prop / partnership / corporation).
- Autosave: every change saves server-side ~1s after typing stops ("Saved ✓"). Resume token: 256-bit,
  only SHA-256 hash stored, 7-day sliding expiry, carried in the URL fragment (never sent to servers or
  leaked via Referer) then as a Bearer header.
- SIN: optional, Luhn-validated, AES-256-GCM encrypted on arrival, never echoed back to the browser
  (resume shows "Saved securely — ends in 544").
- Uploads: browser → Supabase Storage via signed upload URL (never through Netlify functions); server then
  verifies existence, size and file signature (magic bytes) before accepting. PDF/JPG/PNG/HEIC, 25 MB each,
  multiple per slot, progress bars, remove.
- Consents: 4 separate unticked boxes; each submission stores consent key, version, exact text shown,
  SHA-256 of the text, timestamp, IP and browser.
- Confirmation: what happens next, reference number, booking button (shown once `links.bookingUrl` is set).
- Tests: `tests/e2e/intake.spec.ts` (Playwright, iPhone 13 viewport) — 4/4 passing. Unit tests 23/23.
