# GK_SETUP — everything you need to do to go live, in order

About 2–3 hours, mostly waiting on DNS and approvals. Do the steps in order: later steps need keys from earlier
ones. Nothing secret goes in the repo. Every key goes into **Netlify → Site configuration → Environment
variables**. The full list of names is in `.env.example`.

> Messages stay in **dry-run** (logged, not sent) until step 11. You can set everything up and test safely.

---

## 1. Get the code onto GitHub

The build session couldn't push (GitHub returned 403: the Claude GitHub App has no access to
`otaalgurkiratsingh/Perfect_Tax`). Either:
- install or reconnect the Claude GitHub App for that repo at https://claude.ai/connect-github and ask Claude to
  push branch `claude/markdown-file-review-nosyqr`, or
- push it yourself from a machine holding this working copy.

Then merge it into `main` (that one merge is the single production deploy).

## 2. Supabase project — MUST be in Canada

The build didn't create it: it costs money and belongs in the firm's account, so it's your decision.
1. https://supabase.com/dashboard → **New project**, ideally in a new organization owned by the firm (not TrainLuma).
2. **Region: `Canada (Central)` = `ca-central-1`.** This can't be changed later. If it's wrong, delete the project and start again.
3. Save the database password in your password manager.
4. **Project Settings → API**: copy the Project URL, the publishable/anon key and the secret/service_role key.
5. **Authentication → Sign In / Providers**:
   - *Allow new users to sign up* → **OFF** (the app creates staff and client accounts itself).
   - Email provider → **ON**, *Confirm email* ON.
   - Minimum password length **12**; require lower, upper and digits.
6. **Authentication → Multi-Factor**: TOTP (authenticator app) **enabled** (it is by default).
7. **Authentication → URL Configuration**: Site URL = your intake URL (step 4), e.g. `https://intake.yourfirm.ca`.
   Add `https://intake.yourfirm.ca/**` to Redirect URLs.
8. Apply the database schema from your computer, inside the repo:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push          # applies supabase/migrations/*.sql in order
   psql "<connection string>" -f supabase/checks/security.sql   # every section must say (0 rows)
   ```
   (Alternative: paste each file from `supabase/migrations/` into the SQL Editor, oldest first.)
9. **Storage**: confirm the `documents` bucket exists and is **Private**. The migration creates it.

## 3. Generate the app secrets

Run this three times and keep the outputs:
```bash
openssl rand -base64 32
```
- `SIN_ENCRYPTION_KEY`: **back this one up somewhere safe and offline.** Lose it and stored SINs can't be read.
  Never change it once real SINs are stored.
- `LINK_SIGNING_SECRET`
- `CRON_SECRET`

## 4. Pick the web address

Use a subdomain of the firm's website, e.g. `intake.<firm-domain>.ca`. You'll point it at Netlify in step 9.
`NEXT_PUBLIC_SITE_URL` = `https://intake.<firm-domain>.ca` (no trailing slash).

## 5. Email — Resend

1. https://resend.com → add the firm's domain → add the SPF/DKIM DNS records it shows → wait for **Verified**.
2. Create an API key → `RESEND_API_KEY`.
3. In `firm.config.ts` set `notifications.fromEmail` to an address on that domain, e.g. `intake@<firm-domain>.ca`.
   It can't be `@live.ca` because a Hotmail/Live address can't be verified.

## 6. Text messages — Twilio

1. https://twilio.com → buy a **Canadian** local number with SMS (or create a Messaging Service).
2. Twilio Console → Messaging → **Advanced Opt-Out: ON** (STOP/START replies for CASL and carriers).
3. On the number or Messaging Service, set **"A message comes in"** webhook to
   `https://intake.<firm-domain>.ca/api/webhooks/twilio` (HTTP POST). The app records STOP/START.
4. Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_SMS_FROM` (+1… number) **or** `TWILIO_MESSAGING_SERVICE_SID`.
5. Check whether Canadian A2P/10DLC or toll-free verification applies to the firm's sender and complete it if so.

### 6b. WhatsApp (optional; can be done later)
1. Twilio → Messaging → Senders → **WhatsApp** → register the firm's WhatsApp Business number (Meta review).
2. Create Content Templates for `quarter_request`, `quarter_reminder_7/14/21/28`, using the WhatsApp text in
   `firm.config.ts`. Submit them for Meta approval. Variables are `{{1}}`, `{{2}}`, … in the order given by
   `contentVariables`.
3. Paste each approved template's `HX…` SID into its `whatsapp.contentSid` in `firm.config.ts`, set
   `features.whatsappEnabled: true` and set env `TWILIO_WHATSAPP_FROM` (+1… WhatsApp number).
Until then, quarterly requests go by **SMS + email**. Nothing breaks.

## 7. Spam protection — Cloudflare Turnstile

https://dash.cloudflare.com → Turnstile → Add site → domain `intake.<firm-domain>.ca`, mode **Managed** →
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`. **Without these, production refuses new forms**
(it fails closed by design).

## 8. Booking link — Cal.com

Copy the onboarding-call booking URL into `links.bookingUrl` in `firm.config.ts`. While it's blank, the
confirmation screen hides the "Book your onboarding call" button.

## 9. Netlify

1. https://app.netlify.com → Add new site → Import from GitHub → this repo. Build settings come from `netlify.toml`.
2. **Site configuration → Build & deploy → Branches**: Production branch = `main`. `netlify.toml` already
   cancels every non-production build (no branch deploys, no previews), which protects your build minutes.
3. **Environment variables**: add everything from steps 2–7, plus:
   - `NEXT_PUBLIC_SITE_URL` (step 4)
   - `MESSAGING_MODE` = `dry_run` for now
   - **Do NOT set** `INSECURE_LOCAL_TESTING` or `DEV_OUTBOX_DIR` (local testing only).
4. **Domain management** → add `intake.<firm-domain>.ca` → create the CNAME record it shows at the firm's DNS
   host → wait for the free HTTPS certificate.
5. Trigger the production deploy (merge to `main`, or "Deploy site").
6. **Scheduled functions**: after the deploy, Netlify → Functions shows `scheduled-jobs` running every 15 min.
   It calls `/api/cron/run` with `CRON_SECRET` (reminders, quarterly chase, retention flags, cleanup).

## 10. First admin + your own 2-step sign-in

From your computer (repo checked out, `.env.local` holding the **production** `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL`):
```bash
npm install
npm run create-admin -- owner@<firm-domain>.ca "Owner Name"
```
Open the printed link within 1 hour → set a password → scan the QR code with an authenticator app. Then add other
staff in **Settings → Staff accounts** (they get a set-password email once email is live). Delete `.env.local`
afterwards, or at least never commit it.

## 11. Firm review, then switch messages on

1. The firm reviews and approves every string marked **[FIRM TO CONFIRM]** in `firm.config.ts` (19 places:
   consent wording, messages, checklists, response time, retention period) and the field list in `FIELD_MAP.md`
   against their paper form. Their lawyer or insurer should read the consent text.
2. Dashboard → **Settings → Go-live checklist** should be all green except WhatsApp (if skipped).
3. Smoke test on your own phone: scan the office QR → submit a test intake with a test document → check the
   firm alert arrives (dry run: see Settings/message log) → open it in the dashboard → request a missing doc →
   upload it → see the status flip → delete the test intake (admin, needs it flagged or just use Delete).
4. Set `MESSAGING_MODE=live` in Netlify → redeploy → repeat the smoke test and confirm the real email and SMS arrive.

## 12. Ongoing

- Every quarter: Dashboard → **Quarterly** → open the quarter (tick "Send requests now") → watch the board.
- Back up `SIN_ENCRYPTION_KEY` (step 3). Supabase backs up the database daily on paid plans. Turn on
  Point-in-Time Recovery if the firm wants more.
- **Never** run `npm run db:seed` against production. It refuses unless given `--allow-remote`.
