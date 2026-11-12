-- Homebase calendar subscription feed. Run after 001_sync.sql (see docs/CLOUD-SETUP.md).
-- Needs the pgcrypto extension (Database > Extensions): extensions.gen_random_bytes and extensions.digest.
--
-- As in 001: `anon` gets nothing, and `authenticated` gets only what the app uses. It can read when
-- its link was made, and replace the calendar text; it cannot change the stored secret hash, which
-- only reset_calendar_token writes.

create table public.calendar_feeds (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,            -- sha256 hex of the secret; the secret itself is never stored
  -- A valid, empty calendar until the first save, so a new link never serves something calendar apps reject.
  ics        text not null default E'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Homebase//Jobs//EN\r\nEND:VCALENDAR\r\n'
             check (octet_length(ics) < 1000000),
  updated_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;

revoke all on table public.calendar_feeds from anon, authenticated;
grant select (user_id, updated_at) on table public.calendar_feeds to authenticated;
grant update (ics, updated_at) on table public.calendar_feeds to authenticated;
-- The Edge Function reads the text by token hash with the project's secret key. Newer projects don't grant that role by default.
grant select on table public.calendar_feeds to service_role;

create policy "read own feed"   on public.calendar_feeds for select to authenticated using ((select auth.uid()) = user_id);
create policy "update own feed" on public.calendar_feeds for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- New or reset link: returns the secret once; the old URL stops working immediately.
create or replace function public.reset_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare secret text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.calendar_feeds (user_id, token_hash)
  values (auth.uid(), encode(extensions.digest(secret, 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, updated_at = now();
  return secret;
end $$;
revoke all on function public.reset_calendar_token() from public, anon;
grant execute on function public.reset_calendar_token() to authenticated;
