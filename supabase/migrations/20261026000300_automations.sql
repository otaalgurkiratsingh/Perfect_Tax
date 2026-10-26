-- Automations: outbound message log and opt-outs (CASL).

-- What was sent, to whom (masked), and the result. Message bodies are NOT stored:
-- only the template key, so links/tokens never land in the database in plain text.
create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  template_key text not null,
  recipient_masked text not null,
  recipient_hash text not null,
  status text not null check (status in ('sent', 'failed', 'dry_run', 'skipped_opt_out', 'fallback_sent')),
  provider_id text,
  error text,
  intake_id uuid references public.intakes (id) on delete cascade,
  doc_request_id uuid references public.doc_requests (id) on delete set null,
  context jsonb not null default '{}'::jsonb
);

create index message_log_intake_idx on public.message_log (intake_id, created_at desc);
create index message_log_provider_idx on public.message_log (provider_id);

alter table public.message_log enable row level security;

create policy "staff read message log" on public.message_log
  for select to authenticated using (public.is_staff());

-- Opt-outs. Address is normalized (E.164 phone or lower-case email).
create table public.opt_outs (
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  address text not null,
  created_at timestamptz not null default now(),
  source text not null,
  primary key (channel, address)
);

alter table public.opt_outs enable row level security;

create policy "staff read opt outs" on public.opt_outs
  for select to authenticated using (public.is_staff());
