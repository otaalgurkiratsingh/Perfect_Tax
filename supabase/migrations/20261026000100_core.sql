-- Core schema: staff, intakes, consents, documents, access tokens, rate limits, settings.
-- Security model:
--   * RLS is enabled on EVERY table. The anon role gets no table access at all.
--   * Staff read through RLS (is_staff()). All writes go through server code using the
--     service role after an explicit authorization check + audit log entry.
--   * Public (client) flows never touch tables directly: they call server routes that
--     validate an unguessable, hashed, expiring access token.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('admin', 'staff');

create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.staff_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and active and role = 'admin'
  );
$$;

-- When the current auth session started (for the absolute staff session limit).
create or replace function public.current_session_started_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select s.created_at
  from auth.sessions s
  where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and s.user_id = auth.uid();
$$;

revoke execute on function public.is_staff() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.current_session_started_at() from anon, public;
grant execute on function public.current_session_started_at() to authenticated;

alter table public.staff_profiles enable row level security;

create policy "staff read staff list" on public.staff_profiles
  for select to authenticated
  using (public.is_staff() or id = auth.uid());

-- ---------------------------------------------------------------------------
-- Intakes
-- ---------------------------------------------------------------------------
create type public.intake_status as enum (
  'draft', 'new', 'in_review', 'docs_missing', 'ready', 'client_created'
);
create type public.applicant_type as enum ('individual', 'couple', 'business');

create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  status public.intake_status not null default 'draft',
  applicant_type public.applicant_type,
  current_step int not null default 1,
  -- All answers except SINs. SINs live only in the encrypted columns below.
  answers jsonb not null default '{}'::jsonb,
  sin_ciphertext text,
  spouse_sin_ciphertext text,
  -- Denormalized for search, lists and notifications (never sensitive).
  primary_name text,
  email text,
  phone text,
  business_name text,
  services text[] not null default '{}',
  referral_source text,
  referral_detail text,
  comms_consent boolean not null default false,
  kiosk boolean not null default false,
  submitted_at timestamptz,
  last_activity_at timestamptz not null default now(),
  abandon_reminders_sent int not null default 0,
  last_abandon_reminder_at timestamptz,
  missing_docs_received_at timestamptz,
  retention_flagged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index intakes_status_idx on public.intakes (status, submitted_at desc);
create index intakes_activity_idx on public.intakes (status, last_activity_at);
create index intakes_services_idx on public.intakes using gin (services);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger intakes_touch before update on public.intakes
  for each row execute function public.touch_updated_at();

alter table public.intakes enable row level security;

create policy "staff read intakes" on public.intakes
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Consent records: exact text + version + timestamp + IP for every submission
-- ---------------------------------------------------------------------------
create table public.intake_consents (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes (id) on delete cascade,
  consent_key text not null,
  version text not null,
  text_shown text not null,
  text_sha256 text not null,
  accepted boolean not null,
  recorded_at timestamptz not null default now(),
  ip text,
  user_agent text,
  unique (intake_id, consent_key)
);

alter table public.intake_consents enable row level security;

create policy "staff read consents" on public.intake_consents
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Documents (files live in the private "documents" storage bucket)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid references public.intakes (id) on delete cascade,
  doc_type text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  status text not null default 'pending' check (status in ('pending', 'uploaded')),
  source text not null check (source in ('intake', 'doc_request', 'quarter_link', 'portal', 'staff')),
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

create index documents_intake_idx on public.documents (intake_id);

alter table public.documents enable row level security;

create policy "staff read documents" on public.documents
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Access tokens (resume links, document-request links, quarterly upload links).
-- Only a SHA-256 hash is stored; the raw token exists only in the link we send.
-- ---------------------------------------------------------------------------
create type public.token_purpose as enum ('intake_resume', 'doc_request', 'quarter_upload');

create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose public.token_purpose not null,
  intake_id uuid references public.intakes (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index access_tokens_intake_idx on public.access_tokens (intake_id);

alter table public.access_tokens enable row level security;
-- No policies: only the service role (server code) can read tokens.

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, shared across serverless instances)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- App settings (single row, admin-editable)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  retention_months int,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.app_settings (id) values (1);

alter table public.app_settings enable row level security;

create policy "staff read settings" on public.app_settings
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Private storage bucket. 25 MB per file; PDF/JPG/PNG/HEIC only.
-- Uploads use short-lived signed upload URLs issued by the server.
-- Staff read via short-lived signed URLs (<= 5 minutes).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "staff read document objects" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_staff());

-- Lock down default grants: anon never touches app tables directly.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
