-- Homebase cloud sync. Run once in the Supabase SQL editor (see docs/CLOUD-SETUP.md).

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

create policy "read own sync row"   on public.home_sync for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own sync row" on public.home_sync for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own sync row" on public.home_sync for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own sync row" on public.home_sync for delete to authenticated using ((select auth.uid()) = user_id);

-- 2. Compare-and-swap commit. Returns the new revision, or NULL when someone else committed first.
create or replace function public.commit_backup(expected bigint, new_path text, new_version int, new_size bigint, dev_id text, dev_label text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); next_rev bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if new_path not like uid::text || '/%' then raise exception 'path outside your folder'; end if;
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
values ('backups', 'backups', false, 52428800, array['application/json']);

create policy "read own backups"   on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "write own backups"  on storage.objects for insert to authenticated
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "update own backups" on storage.objects for update to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
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
