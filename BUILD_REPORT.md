# BUILD REPORT — Client Intake System

**Status: all 7 phases built and committed. All automated tests pass (41 unit + 20 end-to-end in a real browser
against a real local Supabase stack). Not yet deployed:** the production Supabase project (Canada region),
Netlify site and provider accounts are the owner's to create and pay for (steps in `GK_SETUP.md`). Pushing to
GitHub was blocked (403), so the commits are on the local branch `claude/markdown-file-review-nosyqr`.

## Summary for GK

| Phase | What you get |
|---|---|
| 0 Reconcile | `firm.config.ts` = the only firm-specific file. `FIELD_MAP.md` (no paper form was in `intake-source/`, so the default field set is used and every field is listed for review). `.env.example`. 5 SQL migrations. |
| 1 Public form | `/start` → 7-step mobile wizard, branching individual/couple/business, autosave, 7-day resume links, uploads straight to private storage, 4 separate consents stored with exact text, version, time and IP. Booking button on the confirmation screen. Turnstile (start page only) + honeypot + rate limits. Office kiosk mode. |
| 2 Dashboard | 2-step sign-in required, idle and absolute session limits, rate-limited logins. Inbox pipeline with filters and search, detail view, masked SIN with logged reveal, signed-URL document access, ZIP, SIN-free CSV, request-missing-docs links, append-only audit log, settings, office QR. |
| 3 Automations | Firm alert (name + services + link only), client auto-reply, abandonment reminders at 24h/72h then stop, missing-doc reminders weekly ×3 then stop, STOP/unsubscribe (CASL), retention flags. Netlify scheduled function every 15 min. |
| 4 Quarterly engine | Clients, one-click "open quarter" with checklists per service, personal upload links, magic-link client page, Day 0/7/14/21/28 chase only to incomplete clients (stops the moment they finish), WhatsApp → SMS fallback, quarter board with nudges and "processed". |
| 5 Extraction (beta) | Text-based bank-statement PDFs → one CSV per client-quarter, reconciled against opening/closing balances with high/medium/low confidence. Scanned statements go to manual review and are never guessed. |
| 6 Hardening | Database security self-check (RLS on every table, no anon access, private bucket, pinned search_path), seed data, 20 e2e tests, `STAFF_GUIDE.md`, `GK_SETUP.md`. |

## Acceptance checklist — honest results

Evidence: `npx playwright test` → **20 passed**. `npx vitest run` → **41 passed**. Lint and typecheck clean.
`npm audit --omit=dev` → 0 vulnerabilities. Test names below are from `tests/e2e/*.spec.ts`.

- [x] **Phone: full individual intake incl. 2 uploads in under 5 minutes.** `intake.spec.ts` › "individual completes…"
  runs on an iPhone 13 viewport: every field, 2 uploads, consents, review, submit. Automated run: **5.5 s**.
  *Honest caveat:* that's a robot's speed. A real person types ~25 fields; it's built for ~5 minutes but hasn't been
  timed with a real client. Worth one hallway test.
- [x] **Abandon → resume restores every answer and file.** `intake.spec.ts` › "abandoning mid-way…" (new device,
  every step checked, file listed, SIN shown as "ends in 544") and `automations.spec.ts` › "abandoned form…"
  (the real reminder link).
- [x] **Business branches correctly (BN + fiscal year-end appear, spouse doesn't).** `intake.spec.ts` › "business intake branches…".
- [x] **Staff see a new intake within seconds; alert has zero sensitive data.** `dashboard.spec.ts` › "new intake…":
  visible **0.5 s** after submit. The email and SMS alerts were checked for SIN digits, birth date, address,
  postal code, client email and phone, file names and referral text: none present.
- [x] **Request-docs flow; status flips.** `dashboard.spec.ts` › "request missing docs…": the link shows only the
  requested item and refuses other types. The intake flips Docs Missing → In Review with a "received" badge.
- [x] **ZIP has the full package; CSV has no SIN.** `dashboard.spec.ts` › "detail view…": ZIP = summary + both
  files (SIN masked in the summary). CSV has a "SIN on file: yes" column and no SIN digits or ciphertext.
- [x] **Unauthenticated document access fails; signed URLs expire.** Same test: staff route without a session →
  401; public, direct and anon-authenticated storage URLs → refused; signed URL lifetime ≤ 300 s (read from its
  token); a 1-second URL fails after expiry.
- [x] **Audit log records view, download, export.** Same test: `view_intake`, `reveal_sin`, `view_document`,
  `download_document`, `download_zip`, `export_csv` rows, plus the admin audit page showing them.
- [x] **Reminders at 24h/72h then stop; missing-doc reminders stop after 3.** `automations.spec.ts` (time shifted in
  the DB, real cron endpoint): none at 23h, one pair at 25h, nothing on rerun, second at 73h, nothing after.
  Doc requests: 1, 2, 3, then still 3.
- [x] **Opening a quarter builds the right checklists for 3 client types; Day-0 request has a working link.**
  `quarterly.spec.ts` + `quarterly.test.ts`: bookkeeping / payroll / HST / combined checklists exact; the Day-0
  SMS link opens the client's checklist and accepts uploads. *Caveat:* WhatsApp is **off** until Meta approves
  the templates, so Day 0 went by **SMS + email**. The WhatsApp-first → SMS-fallback logic is unit-tested
  (`whatsapp.test.ts`), and a Twilio "undelivered" WhatsApp callback triggering the SMS fallback is e2e-tested.
  A real WhatsApp delivery wasn't possible without a Twilio WhatsApp sender.
- [x] **Completing a checklist stops that client's reminders at once; others keep getting chased.**
  `quarterly.spec.ts`: on day 7 the complete client got nothing while partial and requested clients did. After
  Delta completed, day 14 went to the others but not Delta.
- [x] **Quarter board shows Not Sent / Requested / Partial / Complete / Processed accurately.** `quarterly.spec.ts`
  checks counts (1 each) and each row's status. `npm run db:seed` produces the same board for a demo.
- [x] **Extraction: text PDF → CSV whose totals match; scanned → flagged.** `extraction.spec.ts`: 48-transaction
  statement → CSV debits 28,277.62 / credits 44,198.57 match the statement, and opening + credits − debits =
  closing. A second bank layout also matches. Scanned → "manual review" with no rows. Tampered → "low".
  *Caveat:* the statements are synthetic (modelled on common Canadian layouts). No real bank PDFs were available.
- [x] **Everything firm-specific in the one config file.** `brand.test.ts` greps the firm's name, short name,
  phone, email and street address across the repo: zero hits outside `firm.config.ts` (docs included).

## Blockers needing GK (exact fixes in `GK_SETUP.md`)

1. **GitHub push denied (403).** Install or reconnect the Claude GitHub App for `otaalgurkiratsingh/Perfect_Tax`
   (https://claude.ai/connect-github), then push `claude/markdown-file-review-nosyqr`. The brief named
   `claude/intake-build`, but this session could only push the branch above. Rename on merge if you like.
2. **Supabase production project in `ca-central-1`.** Not created by the build: it's a billable decision and
   belongs in a firm-owned org (the only existing project, "trainluma", is a different product and was left
   untouched). GK_SETUP step 2.
3. **Accounts and keys:** Resend (verified domain + `fromEmail`), Twilio (Canadian number, Advanced Opt-Out,
   inbound webhook), Turnstile, Netlify site + subdomain, Cal.com link. Production refuses new forms until
   Turnstile keys are set (fails closed).
4. **Firm sign-off:** 19 `[FIRM TO CONFIRM]` items in `firm.config.ts` (consent text should go past a lawyer or
   insurer) and the field list in `FIELD_MAP.md` against the real paper form.

## Go-live steps remaining (short version)
Push → Supabase (Canada) + migrations + security check → secrets → Resend → Twilio → Turnstile → Netlify (env,
domain, merge to `main` = one production build) → `npm run create-admin` → firm review → smoke test in dry-run →
`MESSAGING_MODE=live` → smoke test again. Optional later: WhatsApp templates.

## Known gaps (nothing hidden)
- **Not run on Netlify yet.** Built and tested with `next build && next start` locally. The Netlify Next.js
  runtime, the scheduled function and the pdf.js worker bundle (`serverExternalPackages`) should be checked on the
  first production deploy (smoke test in GK_SETUP step 11).
- **WhatsApp** needs Meta-approved templates and a Twilio WhatsApp sender. Off until then (SMS + email instead).
- **Abandonment reminders** go to people who started a form but haven't ticked the marketing consent. They're
  treated as transactional ("finish what you started"), with opt-out in every message. Firm/lawyer to confirm.
- **Quarters are calendar quarters.** Clients on non-calendar fiscal quarters aren't modelled separately.
- **Uploads are checked** for type (file signature), size and destination but **not virus-scanned**. Staff only
  open PDFs/JPG/PNG in the browser; HEIC downloads only.
- **Quarterly clients can be deactivated, not deleted,** from the UI. Intakes can be deleted by an admin.
  Deleting a quarterly client's whole history (a PIPEDA deletion request) currently needs a database action.
- **Statement extraction** is beta and only proven on synthetic layouts. Run the firm's real statements from
  their top banks through it before relying on it.
- **Time-to-complete** is measured by automation only (see checklist).
- Local test DB contains many e2e test records. Production starts empty.

## Branch note

The brief asks for branch `claude/intake-build`. This session is restricted to pushing to
`claude/markdown-file-review-nosyqr`, so all phase commits are on that branch. Rename or merge as you like.

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

### Phase 5 — Statement Extraction (beta)
- On each client-quarter page, staff click "Read all statements" (or one file). Text-based PDF bank statements
  are read with pdf.js on the server (no third-party service). Output: date, description, withdrawal (debit),
  deposit (credit), balance, page, and a per-row "needs checking" note. "Download CSV" combines every statement
  of the client-quarter into one clean CSV.
- **Never guesses:** scanned/photographed statements (no text layer), unreadable or encrypted PDFs, and pages
  without a recognisable Date/Withdrawals/Deposits/Balance table are marked **manual review** with no numbers.
  Amounts must sit under a recognised column header; anything else is flagged.
- **Confidence per file:** high = opening + deposits − withdrawals equals the printed closing balance AND every
  printed running balance matches; medium = totals reconcile but some rows are flagged; low = totals don't
  reconcile or opening/closing can't be found (the reason is spelled out).
- The UI states plainly that this assists bookkeeping and does not replace staff judgment.
- Handles two common layouts: balance on every row ("Mon DD" dates), and date-once-per-day with the balance only
  at day end ("DD Mon" dates, "Cheques & Debits ($)" headers); multi-page tables and wrapped descriptions.
- Tests: `extraction.test.ts` (6 unit) + `extraction.spec.ts` (e2e: 48-transaction statement → CSV totals match to
  the cent; scanned → manual review; tampered → low) — passing.
- Limits (honest): tested on synthetic statements modelled on common Canadian layouts, not on real bank PDFs
  (none were available). Real statements from the firm's top banks should be run through it before relying on it;
  the confidence flag will show where a layout isn't understood.

### Phase 6 — Hardening + proof
- PIPEDA list re-checked in code and tests: Canada region (setup step, can't be set from code without a billable
  project), TLS + HSTS, encryption at rest (Supabase default) + AES-256-GCM for SINs, RLS on every table, private
  bucket, signed URLs ≤ 5 min, SIN never in messages/logs/CSV/notifications, consent records, retention flags
  only, no trackers (e2e test confirms zero third-party requests on the form), session expiry, audited downloads,
  rate-limited logins.
- `supabase/checks/security.sql` + `database.spec.ts`: RLS everywhere, no anon grants or policies, SECURITY
  DEFINER functions pin search_path, bucket private, rate-limit function not callable by clients, SINs only as
  ciphertext, audit log refuses update and delete.
- Fixes found during hardening: auth redirects now use the configured site URL; live-mode messages on an
  unconfigured channel count as failed (so WhatsApp → SMS fallback works); a failed staff login keeps the typed
  email; sign-out of an idle session only ends that device's session.
- `npm run db:seed`: demo data (refuses non-local databases unless `--allow-remote`). `STAFF_GUIDE.md`, `GK_SETUP.md`, `README.md`.
