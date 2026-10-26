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

### Phase 2 — Staff dashboard
- Supabase Auth email + password; public sign-up disabled. **2-step sign-in (authenticator app/TOTP) is
  required** for every staff member (`features.requireStaff2FA`). Failed logins rate-limited per IP (20/15 min)
  and per email (5/15 min) and audit-logged. Sessions: 30-min idle timeout + 12-hour absolute limit; auth
  cookies are httpOnly + Secure. Deactivated staff lose access immediately.
- Roles: admin (audit log, settings, staff accounts, permanent delete) and staff.
- Inbox: pipeline tabs with counts (New → In Review → Docs Missing → Ready → Client Created), plus
  "Unfinished" drafts and "Deletion review"; filter by service and date; search name/email/business/reference;
  referral source shown on every row.
- Intake detail: every answer, SIN masked (`••• ••• 544`) with an optional audit-logged 30-second reveal,
  documents (view in browser for PDF/JPG/PNG, download for all; each via a ≤5-minute signed URL and logged),
  consent records with exact text, message history, missing-doc request history.
- ZIP: the browser builds the ZIP from short-lived signed URLs (Netlify functions can't return big files);
  includes a text summary of all answers + consents (SIN masked). Logged as `download_zip`.
- "Request missing docs": pick items → client gets an upload-only link (7 days) by email + SMS showing ONLY
  those items; when every item arrives the request closes and the intake flips to In Review with a
  "Missing documents received" badge.
- CSV export of the current view: `SIN on file: yes/no` only; formula-injection-safe cells; logged.
- Append-only audit log (DB trigger blocks update/delete/truncate) + admin viewer with filters.
- Settings: go-live checklist, retention months, add/turn off staff, change roles. Office QR code page (printable).
- `npm run create-admin -- you@firm.ca "Name"` creates the first admin and prints a set-password link.
- Tests: `dashboard.spec.ts` (5) + `security.spec.ts` (1) — all passing.

### Phase 3 — Automations
- On submit: firm alert by email + SMS (to `notifications.firmEmails` / `firmSmsNumbers`) with **only** name,
  services ticked and the dashboard link. Template engine refuses undeclared variables and any variable named
  like SIN/birth/account/secret; a unit test pins the alert's allowed variables to exactly those three.
- On submit: client auto-reply (email + SMS if a phone was given) with reference number and next steps.
- Abandonment: reminder 1 at 24h idle, reminder 2 at 72h (and ≥24h after #1), then stop. Each reminder carries
  a fresh 7-day resume link.
- Missing documents: reminder every 7 days while the request is open, max 3, then stop. Fresh link each time.
- Every SMS/WhatsApp names the firm and ends "Reply STOP to opt out."; every client email has the firm's name,
  address and a signed one-click-to-confirm unsubscribe link. Inbound STOP/START via a signature-checked Twilio
  webhook. Opted-out addresses are skipped and logged as `skipped_opt_out`.
- Automated reminders only go out 9am–7pm Toronto time (configurable); instant notifications go any time.
- Retention: intakes older than the admin-set period are FLAGGED for review; deletion is a manual, admin-only,
  type-the-reference action that is audit-logged.
- **Scheduler choice: Netlify Scheduled Function** (`netlify/functions/scheduled-jobs.mts`, every 15 min) calling
  `POST /api/cron/run` with `CRON_SECRET`. Why: it ships with the code in the same repo and deploy, needs no
  extra Supabase extensions (pg_cron + pg_net) or database-stored secrets, logs show up in Netlify next to the
  app, and every job is idempotent with atomic "claim then send" updates, so a missed or doubled run is harmless.
  Scheduled functions only run on the production deploy, which matches the no-branch-deploys rule.
- Tests: `automations.spec.ts` (6) — all passing.

### Phase 4 — Quarterly Collection Engine
- **Clients**: persistent client records (business, contact, email, mobile, WhatsApp number, services =
  bookkeeping / payroll / HST). Created from an intake in one click ("Create client") or added manually.
- **Client page** (`/portal`): password-less magic-link sign-in; shows the current quarter's checklist with an
  upload slot per item and past quarters' history. Row Level Security limits a signed-in client to their own rows.
- **Quarter cycles**: staff open a quarter once (`/staff/quarters`) → every active client gets a checklist built
  from the templates for their services, merged without duplicates, with plain instructions
  ("…for Oct to Dec 2026"). Calendar quarters.
- **Personal upload link** (`/q#t=…`): no login; checklist, per-item upload slots, "Nothing to send for this one
  this quarter", live progress, "All done" message. Files are stored as
  `clients/<client>/<YYYY-Qn>/<document type>/…` — no email attachments anywhere.
- **The chase**: Day 0 request (WhatsApp → SMS fallback, + email), then day 7 gentle / 14 (the firm's "second
  message" wording [FIRM TO CONFIRM]) / 21 firmer / 28 final, ONLY to clients still Requested/Partial. Completing
  the checklist flips the client to Complete inside the upload request, so their reminders stop instantly. If the
  job was down it sends only the latest due reminder (no bursts). WhatsApp failures reported later by Twilio's
  status callback trigger the SMS fallback.
- **Quarter board** (`/staff/quarters/<id>`): every client × Not Sent / Requested / Partial / Complete / Processed,
  counts, filters (status, service, search), checklist progress, last and next reminder, one-click Send/Nudge,
  Mark processed, bulk "Send requests to all Not Sent" and "Nudge all stragglers".
- WhatsApp templates live in `firm.config.ts` next to SMS/email. WhatsApp stays OFF (`features.whatsappEnabled`)
  until a Twilio WhatsApp sender and Meta-approved templates (`contentSid`) exist; until then SMS + email.
- Tests: `quarterly.spec.ts` (full cycle with 5 clients) + `whatsapp.test.ts` (fallback logic) — passing.
