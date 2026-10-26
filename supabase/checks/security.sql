-- Security self-check. Every query must return ZERO rows.
-- Run: psql "$SUPABASE_DB_URL" -f supabase/checks/security.sql  (also run by tests/e2e/database.spec.ts)

-- 1. Tables in public without Row Level Security
select 'rls_disabled' as problem, c.relname as object
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2. Any table privilege granted to the anonymous role
select 'anon_grant' as problem, table_name || ':' || privilege_type as object
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';

-- 3. Any RLS policy that applies to anon/public
select 'policy_for_anon' as problem, tablename || '.' || policyname as object
from pg_policies
where schemaname = 'public' and (roles @> array['anon']::name[] or roles @> array['public']::name[]);

-- 4. SECURITY DEFINER functions without a pinned search_path
select 'definer_without_search_path' as problem, p.proname as object
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');

-- 5. Storage buckets that are public
select 'public_bucket' as problem, id as object from storage.buckets where public;

-- 6. Rate-limit function callable by anon/authenticated
select 'rate_limit_exposed' as problem, r.rolname as object
from pg_roles r
where r.rolname in ('anon', 'authenticated')
  and has_function_privilege(r.oid, 'public.rate_limit_hit(text,int,int)', 'execute');
