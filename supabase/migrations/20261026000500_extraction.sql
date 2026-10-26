-- Statement extraction (beta): per-file results for text-based bank statement PDFs.
-- Scanned/image-only statements are recorded as 'manual_review' — numbers are never guessed.

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents (id) on delete cascade,
  client_quarter_id uuid references public.client_quarters (id) on delete cascade,
  status text not null check (status in ('extracted', 'manual_review', 'failed')),
  confidence text not null check (confidence in ('high', 'medium', 'low', 'none')),
  reason text not null,
  transaction_count int not null default 0,
  total_debits numeric(14, 2),
  total_credits numeric(14, 2),
  opening_balance numeric(14, 2),
  closing_balance numeric(14, 2),
  reconciled boolean not null default false,
  transactions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index extractions_client_quarter_idx on public.extractions (client_quarter_id);

alter table public.extractions enable row level security;

create policy "staff read extractions" on public.extractions
  for select to authenticated using (public.is_staff());
