-- Quarterly Collection Engine: persistent clients, quarters, per-client checklists.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  email text,
  phone text,
  whatsapp_phone text,
  services text[] not null default '{}',
  active boolean not null default true,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  intake_id uuid references public.intakes (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create unique index clients_email_idx on public.clients (lower(email)) where email is not null;

create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

create table public.quarters (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2000 and 2100),
  quarter int not null check (quarter between 1 and 4),
  label text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users (id),
  unique (year, quarter)
);

create type public.client_quarter_status as enum ('not_sent', 'requested', 'partial', 'complete', 'processed');

create table public.client_quarters (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  status public.client_quarter_status not null default 'not_sent',
  requested_at timestamptz,
  last_reminder_day int not null default 0,
  last_reminder_at timestamptz,
  completed_at timestamptz,
  processed_at timestamptz,
  processed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (client_id, quarter_id)
);

create index client_quarters_chase_idx on public.client_quarters (status, requested_at);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_quarter_id uuid not null references public.client_quarters (id) on delete cascade,
  item_key text not null,
  label text not null,
  instructions text not null,
  required boolean not null default true,
  bank_statement boolean not null default false,
  sort_order int not null default 0,
  status text not null default 'missing' check (status in ('missing', 'received', 'not_applicable')),
  received_at timestamptz,
  client_note text,
  updated_at timestamptz not null default now(),
  unique (client_quarter_id, item_key)
);

create trigger checklist_items_touch before update on public.checklist_items
  for each row execute function public.touch_updated_at();

alter table public.documents
  add column client_id uuid references public.clients (id) on delete cascade,
  add column client_quarter_id uuid references public.client_quarters (id) on delete cascade,
  add column checklist_item_id uuid references public.checklist_items (id) on delete set null;

create index documents_client_quarter_idx on public.documents (client_quarter_id);

alter table public.access_tokens
  add column client_quarter_id uuid references public.client_quarters (id) on delete cascade;

alter table public.message_log
  add column client_id uuid references public.clients (id) on delete cascade,
  add column client_quarter_id uuid references public.client_quarters (id) on delete cascade;

create index message_log_client_quarter_idx on public.message_log (client_quarter_id, created_at desc);

alter table public.intakes
  add column client_id uuid references public.clients (id) on delete set null;

-- RLS: staff read everything; signed-in clients read only their own records.
alter table public.clients enable row level security;
alter table public.quarters enable row level security;
alter table public.client_quarters enable row level security;
alter table public.checklist_items enable row level security;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.clients where auth_user_id = auth.uid() and active;
$$;

revoke execute on function public.current_client_id() from anon, public;
grant execute on function public.current_client_id() to authenticated;

create policy "staff read clients" on public.clients
  for select to authenticated using (public.is_staff());
create policy "client reads self" on public.clients
  for select to authenticated using (auth_user_id = auth.uid() and active);

create policy "staff read quarters" on public.quarters
  for select to authenticated using (public.is_staff());
create policy "client reads own quarters" on public.quarters
  for select to authenticated using (
    exists (
      select 1 from public.client_quarters cq
      where cq.quarter_id = quarters.id and cq.client_id = public.current_client_id()
    )
  );

create policy "staff read client quarters" on public.client_quarters
  for select to authenticated using (public.is_staff());
create policy "client reads own client quarters" on public.client_quarters
  for select to authenticated using (client_id = public.current_client_id());

create policy "staff read checklist items" on public.checklist_items
  for select to authenticated using (public.is_staff());
create policy "client reads own checklist items" on public.checklist_items
  for select to authenticated using (
    exists (
      select 1 from public.client_quarters cq
      where cq.id = checklist_items.client_quarter_id and cq.client_id = public.current_client_id()
    )
  );

create policy "client reads own documents" on public.documents
  for select to authenticated using (client_id is not null and client_id = public.current_client_id());
