-- Dashboard: missing-document requests and the append-only audit log.

create table public.doc_requests (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes (id) on delete cascade,
  items text[] not null check (cardinality(items) > 0),
  note text,
  status text not null default 'open' check (status in ('open', 'complete', 'stopped')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  reminders_sent int not null default 0,
  last_sent_at timestamptz
);

create index doc_requests_open_idx on public.doc_requests (status, last_sent_at);
create index doc_requests_intake_idx on public.doc_requests (intake_id);

alter table public.doc_requests enable row level security;

create policy "staff read doc requests" on public.doc_requests
  for select to authenticated using (public.is_staff());

alter table public.documents
  add column doc_request_id uuid references public.doc_requests (id) on delete set null;

alter table public.access_tokens
  add column doc_request_id uuid references public.doc_requests (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Audit log: who viewed / downloaded / exported / changed what, and when.
-- Append-only: updates and deletes are blocked for every role.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('staff', 'client', 'public', 'system')),
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text
);

create index audit_log_time_idx on public.audit_log (occurred_at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id);
create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

alter table public.audit_log enable row level security;

create policy "admins read audit log" on public.audit_log
  for select to authenticated using (public.is_admin());
