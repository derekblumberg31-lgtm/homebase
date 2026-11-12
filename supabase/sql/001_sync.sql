-- Homebase cloud sync. Run once in the Supabase SQL editor (see docs/CLOUD-SETUP.md).
--
-- Access rules, in one place:
--   * `anon` (signed-out visitors) gets nothing: no table, no function, no Storage object.
--   * `authenticated` can READ its own sync row, and call commit_backup / delete_my_account.
--     It cannot write the table directly, so the revision check and the path check in commit_backup
--     cannot be skipped.
--   * Grants are written out in full. New Supabase projects no longer add them to new tables by
--     default, and older projects add too many: the revoke-then-grant below is right for both.
--     "permission denied for table home_sync" after setup means this file did not run completely.

-- 1. Which backup is current for each user. Contents live in Storage.
create table public.home_sync (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  revision       bigint not null check (revision > 0),
  object_path    text   not null,
  backup_version int    not null,
  size_bytes     bigint not null,
  device_id      text   not null,
  device_label   text   not null,          -- "iPhone", "Mac", "this device" (dataSafety.deviceLabel)
  updated_at     timestamptz not null default now()
);
alter table public.home_sync enable row level security;

revoke all on table public.home_sync from anon, authenticated;
grant select on table public.home_sync to authenticated;

create policy "read own sync row" on public.home_sync for select to authenticated using ((select auth.uid()) = user_id);

-- 2. Compare-and-swap commit. Returns the new revision, or NULL when someone else committed first.
--    Runs as its owner (security definer), because the table accepts no direct writes; every check
--    uses auth.uid(), never a value the caller passes in.
create or replace function public.commit_backup(expected bigint, new_path text, new_version int, new_size bigint, dev_id text, dev_label text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); next_rev bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if expected is null or expected < 0 then raise exception 'bad revision'; end if;
  -- <uid>/<expected + 1>-<8 letters or digits>.json: the only name a backup may have.
  if new_path is null or new_path !~ ('^' || uid::text || '/' || (expected + 1)::text || '-[a-z0-9]{8}\.json$') then
    raise exception 'path outside your folder, or not named for the next revision';
  end if;
  if new_size is null or new_size < 0 or new_size > 52428800 then raise exception 'bad size'; end if;
  if dev_id is null or dev_label is null or length(dev_id) > 80 or length(dev_label) > 40 then raise exception 'bad device'; end if;
  if expected = 0 then
    insert into public.home_sync (user_id, revision, object_path, backup_version, size_bytes, device_id, device_label)
    values (uid, 1, new_path, new_version, new_size, dev_id, dev_label)
    on conflict (user_id) do nothing
    returning revision into next_rev;
  else
    update public.home_sync
       set revision = revision + 1, object_path = new_path, backup_version = new_version,
           size_bytes = new_size, device_id = dev_id, device_label = dev_label, updated_at = now()
     where user_id = uid and revision = expected
    returning revision into next_rev;
  end if;
  return next_rev;
end $$;
revoke all on function public.commit_backup(bigint, text, int, bigint, text, text) from public, anon;
grant execute on function public.commit_backup(bigint, text, int, bigint, text, text) to authenticated;

-- 3. Private bucket; each user only touches <their uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do nothing;

create policy "read own backups" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Adding a file: only with the name the app uses, and only while the person holds fewer than 6 files.
-- The app keeps 1 (the current backup) plus at most a few leftovers, so this stops a script that
-- uploads without end, which would otherwise fill the project's storage for everyone. There is no
-- update policy: files are never overwritten.
create policy "add own backup" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9]{1,12}-[a-z0-9]{8}\.json$')
    and (
      select count(*) from storage.objects o
       where o.bucket_id = 'backups' and (storage.foldername(o.name))[1] = (select auth.uid())::text
    ) < 6
  );

create policy "delete own backups" on storage.objects for delete to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 4. Delete the account itself (the client removes Storage objects first).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();   -- cascades to home_sync and calendar_feeds
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
