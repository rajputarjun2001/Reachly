-- Run with local Supabase after migrations:
--   supabase db test
-- Or manually via psql against local DB.
--
-- These tests document expected RLS behavior; they require auth.uid() simulation
-- using supabase test helpers or service role setup.

begin;

select plan(1);

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

select finish();
rollback;
