-- Pass photo: the student's own photo, shown on their live pass and, only while
-- a pass is live at a branch, to that branch's staff (spec section 8, account
-- sharing). Kept separately from verification photos, which are deleted after
-- the school decides. Path rule: {user_id}/pass.{webp|jpg}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pass-photos', 'pass-photos', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.pass_photo_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/pass\.(webp|jpg)$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

create function private.can_write_pass_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pass_photo_owner(p_name) = (select auth.uid()) and not (select private.is_suspended());
$$;

-- The owner, or staff of a branch where the owner has a live pass right now.
create function private.can_read_pass_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pass_photo_owner(p_name) = (select auth.uid())
      or exists (
        select 1 from public.redemption_sessions s
        where s.student_id = private.pass_photo_owner(p_name)
          and s.status in ('awaiting_merchant', 'awaiting_student') and s.expires_at > now()
          and (select private.can_operate_branch(s.branch_id)));
$$;

grant execute on function private.pass_photo_owner(text), private.can_write_pass_photo(text), private.can_read_pass_photo(text) to authenticated;

create policy "students upload their pass photo" on storage.objects
  for insert to authenticated with check (bucket_id = 'pass-photos' and (select private.can_write_pass_photo(name)));
create policy "students replace their pass photo" on storage.objects
  for update to authenticated using (bucket_id = 'pass-photos' and (select private.can_write_pass_photo(name)))
  with check (bucket_id = 'pass-photos' and (select private.can_write_pass_photo(name)));
create policy "students remove their pass photo" on storage.objects
  for delete to authenticated using (bucket_id = 'pass-photos' and private.pass_photo_owner(name) = (select auth.uid()));
create policy "owners and the counter read pass photos" on storage.objects
  for select to authenticated using (bucket_id = 'pass-photos' and (select private.can_read_pass_photo(name)));

-- Record (or clear, with null) the uploaded photo on the profile.
create function public.set_pass_photo(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select private.is_suspended()) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_path is not null then
    if private.pass_photo_owner(p_path) is distinct from (select auth.uid()) then raise exception 'path_invalid' using errcode = 'P0001'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'pass-photos' and name = p_path) then
      raise exception 'photo_missing' using errcode = 'P0001';
    end if;
  end if;
  update public.profiles set avatar_path = p_path where id = (select auth.uid());
  perform private.write_audit(case when p_path is null then 'account.pass_photo_removed' else 'account.pass_photo_set' end,
    'self', 'profile', (select auth.uid()));
end;
$$;

-- Photo paths for the passes on the caller's counter right now.
create function public.counter_pass_photos(p_merchant_id uuid)
returns table (session_id uuid, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, p.avatar_path
  from public.redemption_sessions s
  join public.profiles p on p.id = s.student_id
  where s.merchant_id = p_merchant_id
    and s.status in ('awaiting_merchant', 'awaiting_student') and s.expires_at > now()
    and p.avatar_path is not null and private.pass_photo_owner(p.avatar_path) = s.student_id
    and (select private.can_operate_branch(s.branch_id));
$$;

revoke execute on function public.set_pass_photo(text), public.counter_pass_photos(uuid) from public, anon;
grant execute on function public.set_pass_photo(text), public.counter_pass_photos(uuid) to authenticated;

revoke execute on all functions in schema private from public;
