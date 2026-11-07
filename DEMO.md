# Demo on your laptop (with the owner's phone)

Runs the whole system on your laptop with dummy data. A free Cloudflare tunnel gives a temporary public
`https://…trycloudflare.com` address so the owner can open it on his own phone. Messages are **not** sent
(they're saved in `.outbox/`), and the data is all fake.

**Do steps 1–3 before the meeting:** the first `supabase start` downloads about 2 GB.

## 1. Install (once)
- Node.js 22 — https://nodejs.org
- Docker Desktop, **running** — https://www.docker.com/products/docker-desktop
- Git

## 2. Get the code and start the database
```bash
git clone -b claude/markdown-file-review-nosyqr https://github.com/otaalgurkiratsingh/Perfect_Tax
cd Perfect_Tax
npm install
npx supabase start        # first time: 5–10 minutes
npm run demo:env          # writes .env.local for the demo
npm run db:seed           # demo data; PRINTS THE STAFF PASSWORD — keep it
```

## 3. Build and run
```bash
npm run build
npm start                 # http://localhost:3000 — leave this terminal open
```
Check it on your laptop: http://localhost:3000

## 4. Open it to the owner's phone (in a second terminal)
```bash
npx cloudflared tunnel --url http://localhost:3000
```
It prints an address like `https://random-words.trycloudflare.com`. Then, in a third terminal:
```bash
npm run demo:links -- https://random-words.trycloudflare.com
```
This shows a **QR code** (the owner scans it to fill in the client form on his phone) and prints:
- **Client form:** `/start`, which is what new clients see. Try it on his phone, including taking a photo for an upload.
- **Staff dashboard:** `/staff`, using `seed-admin@example.com` and the password from step 2. The first sign-in asks
  you to scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator…). Do this
  before the meeting.
- **Client page:** a one-time sign-in link for the demo client "Seed Bakery Inc." (their quarter checklist).
  It works once, for 1 hour. Run `demo:links` again for a new one.
- **Personal upload link:** what a client gets by text each quarter. It needs no login.

## A 10-minute demo script
1. **Owner's phone:** scan the QR and fill in the client form as a new client (~3 minutes). Upload a photo.
2. **Your laptop:** open `/staff`. His form is at the top of the inbox. Open it to show the masked SIN, the
   documents and "Download all (ZIP)". Click **Request missing docs** and tick "Void cheque".
3. Open `.outbox/` and find the newest file with `doc_request` in its name. Open its `/upload#t=…` link
   (with the tunnel address in front) on his phone and upload a photo. The intake flips to **In Review** by itself.
4. Go to **Quarterly → 2026-Q3**. The board shows all 5 states. Open **Seed Trucking Ltd** → **Read all
   statements** → **Download CSV** (the bank statements turned into a spreadsheet; the scanned one is flagged).
5. On his phone, open the **client page** link: that's what his business clients see each quarter. Upload
   something and watch the progress bar move.
6. **Settings → Go-live checklist** shows what's left before going live (see `GK_SETUP.md`).

## After the meeting
Press **Ctrl+C** in the tunnel terminal. The public address stops working immediately. `npx supabase stop`
stops the database.

> The demo settings (`INSECURE_LOCAL_TESTING=1`: no spam check, dry-run messages) are only for this laptop
> demo. Never use them for the real deployment.
