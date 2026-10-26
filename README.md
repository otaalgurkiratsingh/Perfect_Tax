# Client Intake System

A white-label, secure client-intake and quarterly document-collection system for accounting firms.
Everything firm-specific (name, branding, contacts, wording, message templates, checklists) lives in
**`firm.config.ts`**.

- **Public intake form** (`/start` → `/intake`): mobile-first 7-step wizard, autosave + resume links,
  direct-to-storage uploads, versioned consent records, Turnstile + honeypot + rate limits.
- **Staff dashboard** (`/staff`): 2-step sign-in, inbox pipeline, intake detail, ZIP, SIN-safe CSV,
  missing-document requests, append-only audit log, settings.
- **Automations**: firm alerts with no sensitive data, client auto-replies, abandonment and missing-doc reminders,
  CASL opt-outs, retention flags. A Netlify scheduled function runs every 15 minutes.
- **Quarterly collection** (`/staff/quarters`, `/q`, `/portal`): per-client checklists, personal upload links,
  Day 0/7/14/21/28 chase that stops when a client completes, quarter board, magic-link client page.
- **Statement extraction (beta)**: text-based bank-statement PDFs → reconciled CSV; scanned → manual review.

Docs: `BUILD_REPORT.md` (what was built + test evidence), `GK_SETUP.md` (go-live steps), `STAFF_GUIDE.md`,
`FIELD_MAP.md` (form fields to verify against the firm's paper form).

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + private Storage + Auth, Canada
region) · Resend (email) · Twilio (SMS/WhatsApp) · Netlify.

## Local development
```bash
npm install
npx supabase start            # local Postgres/Auth/Storage (Docker)
# create .env.local from .env.example using `npx supabase status -o env` values, plus:
#   SIN_ENCRYPTION_KEY / LINK_SIGNING_SECRET / CRON_SECRET  (openssl rand -base64 32)
#   MESSAGING_MODE=dry_run  INSECURE_LOCAL_TESTING=1  DEV_OUTBOX_DIR=$PWD/.outbox  TWILIO_AUTH_TOKEN=local-test
#   SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npm run db:seed               # demo data + prints a staff login
npm run dev
```

## Tests
```bash
npm test                      # unit tests (vitest)
npm run build && npm run test:e2e   # Playwright end-to-end against local Supabase + production build
psql "$SUPABASE_DB_URL" -f supabase/checks/security.sql   # database security self-check (all 0 rows)
```

## Layout
```
firm.config.ts            the ONE firm-specific file
supabase/migrations/      schema, RLS, storage bucket
src/app/                  pages + API routes (public, /staff, /portal, /api)
src/lib/                  intake, messaging, jobs, quarterly, extraction, security
netlify/functions/        scheduled job runner
scripts/                  seed + create-admin
tests/                    unit, e2e, fixtures
```
