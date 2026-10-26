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
