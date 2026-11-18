-- Campus C5: what the admin switches-and-agreements screen reads.
-- Perqly admins (aal2) read; changes still go through admin_set_campus_switch and
-- admin_record/end_campus_agreement, which require a super admin.

create function public.admin_campus_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'switches', jsonb_build_object(
      'posts', private.campus_switch('campus.posts_enabled'),
      'comments', private.campus_switch('campus.comments_enabled')),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object(
               'institution_id', i.id, 'short_name', i.short_name, 'name', i.name,
               'signed_on', a.signed_on, 'ends_on', a.ends_on, 'signed_by_name', a.signed_by_name,
               'document_ref', a.document_ref, 'recorded_at', a.recorded_at,
               'active', private.campus_agreement_active(i.id),
               'organisations', (select count(*) from public.campus_organisations o
                                 where o.institution_id = i.id and o.status <> 'archived'))
             order by i.short_name)
      from public.institutions i
      left join public.campus_agreements a on a.institution_id = i.id
      where i.status in ('pilot', 'active') or a.institution_id is not null), '[]'::jsonb));
end;
$$;

revoke execute on function public.admin_campus_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_campus_overview() to authenticated;
