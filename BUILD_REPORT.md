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
