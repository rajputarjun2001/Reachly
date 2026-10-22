-- Run with local Supabase after migrations:
--   supabase db test
-- Or manually via psql against local DB.
--
-- These tests document expected RLS behavior; they require auth.uid() simulation
-- using supabase test helpers or service role setup.

begin;

select plan(4);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ),
  'profiles_select_own policy exists'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_lists' and policyname = 'lead_lists_select'
  ),
  'lead_lists_select policy exists'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_select'
  ),
  'leads_select policy exists'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'leads' and c.relrowsecurity
  ),
  'RLS enabled on leads'
);

select finish();
rollback;
