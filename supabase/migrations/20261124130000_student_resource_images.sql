-- Student Resources: a logo and a cover photo per resource.
--
-- Images are uploaded by Perqly admins (for example a logo from the provider's official
-- press or brand kit, used with the provider's permission). Perqly does not copy logos from
-- other sites automatically. Public bucket: images are shown to students on the cards and
-- detail page. Path: {resource_id}/{uuid}.{webp|png|jpg}. Only admins with two-factor write.

alter table public.student_resources
  add column logo_path text check (logo_path is null or char_length(logo_path) <= 200),
  add column cover_path text check (cover_path is null or char_length(cover_path) <= 200);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-images', 'resource-images', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The resource an image path belongs to, or null when the path isn't in the expected shape.
create function private.resource_image_resource(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
revoke execute on function private.resource_image_resource(text) from public, anon;
grant execute on function private.resource_image_resource(text) to authenticated;

create policy "admins upload resource images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'resource-images' and (select private.is_staff('admin'))
    and (select private.resource_image_resource(name)) is not null);
create policy "admins remove resource images" on storage.objects
  for delete to authenticated using (bucket_id = 'resource-images' and (select private.is_staff('admin')));
create policy "admins read resource image objects" on storage.objects
  for select to authenticated using (bucket_id = 'resource-images' and (select private.is_staff('admin')));

-- Sets or clears a resource's logo or cover. Returns the previous path so the app can remove the old file.
create function public.admin_set_student_resource_image(p_id uuid, p_kind text, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text;
begin
  perform private.require_resource_admin();
  if p_kind not in ('logo', 'cover') then raise exception 'kind_invalid' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.student_resources where id = p_id) then
    raise exception 'resource_not_found' using errcode = 'P0001';
  end if;
  if p_path is not null and (
       private.resource_image_resource(p_path) is distinct from p_id
       or not exists (select 1 from storage.objects where bucket_id = 'resource-images' and name = p_path)) then
    raise exception 'image_invalid' using errcode = 'P0001';
  end if;
  if p_kind = 'logo' then
    select logo_path into v_old from public.student_resources where id = p_id for update;
    update public.student_resources set logo_path = p_path, updated_by = (select auth.uid()) where id = p_id;
  else
    select cover_path into v_old from public.student_resources where id = p_id for update;
    update public.student_resources set cover_path = p_path, updated_by = (select auth.uid()) where id = p_id;
  end if;
  perform private.write_audit('resource.image_changed', 'platform:admin', 'student_resource', p_id,
    jsonb_build_object('kind', p_kind, 'had_image', v_old is not null), jsonb_build_object('kind', p_kind, 'has_image', p_path is not null));
  return v_old;
end;
$$;
revoke execute on function public.admin_set_student_resource_image(uuid, text, text) from public, anon;
grant execute on function public.admin_set_student_resource_image(uuid, text, text) to authenticated;

-- Include the images when resources are read.
create or replace function private.resource_json(r public.student_resources)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'name', r.name, 'provider', r.provider, 'category', r.category,
    'offer_type', r.offer_type, 'offer_label', r.offer_label, 'summary', r.summary, 'description', r.description,
    'benefits', to_jsonb(r.benefits), 'requirements_note', r.requirements_note, 'eligibility', r.eligibility,
    'availability', r.availability, 'needs_school_email', r.needs_school_email, 'needs_student_proof', r.needs_student_proof,
    'needs_institution_listed', r.needs_institution_listed, 'needs_payment_card', r.needs_payment_card, 'min_age', r.min_age,
    'official_url', r.official_url, 'source_url', r.source_url, 'checked_on', r.checked_on, 'featured', r.featured,
    'status', r.status, 'published_at', r.published_at, 'updated_at', r.updated_at,
    'logo_path', r.logo_path, 'cover_path', r.cover_path);
$$;
revoke execute on function private.resource_json(public.student_resources) from public, anon, authenticated;
