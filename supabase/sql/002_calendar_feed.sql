-- Homebase calendar subscription feed. Run after 001_sync.sql (see docs/CLOUD-SETUP.md).
-- Needs the pgcrypto extension (Database > Extensions): extensions.gen_random_bytes and extensions.digest.

create table public.calendar_feeds (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,            -- sha256 hex of the secret; the secret itself is never stored
  ics        text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy "own feed" on public.calendar_feeds for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- New or reset link: returns the secret once; the old URL stops working immediately.
create or replace function public.reset_calendar_token() returns text
language plpgsql security invoker set search_path = '' as $$
declare secret text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.calendar_feeds (user_id, token_hash)
  values (auth.uid(), encode(extensions.digest(secret, 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, updated_at = now();
  return secret;
end $$;
grant execute on function public.reset_calendar_token() to authenticated;
