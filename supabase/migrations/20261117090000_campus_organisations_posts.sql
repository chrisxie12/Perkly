-- Campus module, phase C1: organisations and posts.
-- Design: Campus founder review and decision record (17 Nov 2026), docs/CAMPUS.md.
--
-- Additive only. One existing table gains a constraint that is already true
-- (campuses: unique (id, institution_id)); two existing functions are replaced
-- with the same signature and a compatible result (get_my_context,
-- is_tunable_setting). Nothing else that exists is changed.
--
-- Both Campus switches start at 0. With them off, every student, member and
-- public Campus function refuses or returns nothing. Perqly admin set-up
-- functions (organisations, members, agreements) work while off, so
-- organisations can be prepared before launch.
--
-- Campus notifications are in-app only in C1: rows are created with push and
-- email already 'skipped', so the delivery queue never picks them up.

-- Settings ---------------------------------------------------------------------------
insert into private.app_settings (key, value) values
  ('campus.posts_enabled', '0'),
  ('campus.comments_enabled', '0'),
  ('campus.posts_per_org_per_day', '10'),
  ('campus.comments_per_student_per_hour', '30'),
  ('campus.reports_per_user_per_day', '20')
on conflict (key) do nothing;

-- Limits are tunable through admin_set_setting; the two on/off switches are not
-- (that function refuses 0), they have their own function below.
create or replace function private.is_tunable_setting(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_key ~ '^(redemption|qr|booking)\.[a-z_]+$'
      or p_key in ('verification.otp_max_per_hour', 'verification.document_retention_days')
      or (p_key ~ '^campus\.[a-z_]+$' and p_key !~ '_enabled$');
$$;

-- Existing table: declare a pair that is already unique (id is the primary key),
-- so campus rows can reference a campus together with its school.
alter table public.campuses add constraint campuses_id_institution_key unique (id, institution_id);

-- Tables -----------------------------------------------------------------------------

-- A school's signed agreement that lets Perqly show content as University official.
-- The only source of that status; review_delegated_at is unrelated (student verification).
create table public.campus_agreements (
  institution_id uuid primary key references public.institutions (id) on delete cascade,
  signed_on date not null,
  ends_on date,
  signed_by_name text not null check (char_length(btrim(signed_by_name)) between 3 and 120),
  document_ref text not null check (char_length(btrim(document_ref)) between 3 and 200),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_agreements_dates check (ends_on is null or ends_on > signed_on)
);
create trigger campus_agreements_updated_at before update on public.campus_agreements
  for each row execute function private.set_updated_at();

create table public.campus_organisations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id),
  campus_id uuid,
  kind text not null check (kind in ('src', 'faculty', 'department', 'hall', 'club', 'society', 'association', 'administration')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9-]{2,64}$'),
  description text check (description is null or char_length(description) <= 2000),
  logo_path text,
  contact_email extensions.citext check (
    contact_email is null
    or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
  ),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ]{6,19}$'),
  status text not null default 'draft' check (status in ('draft', 'verified', 'suspended', 'archived')),
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_organisations_id_institution_key unique (id, institution_id),
  constraint campus_organisations_slug_key unique (institution_id, slug),
  constraint campus_organisations_campus_fk foreign key (campus_id, institution_id) references public.campuses (id, institution_id),
  constraint campus_organisations_verified_at check (status <> 'verified' or verified_at is not null)
);
create index campus_organisations_institution on public.campus_organisations (institution_id, status, name);
create trigger campus_organisations_updated_at before update on public.campus_organisations
  for each row execute function private.set_updated_at();

create table public.organisation_members (
  organisation_id uuid not null,
  institution_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor')),
  title text check (title is null or char_length(btrim(title)) between 2 and 60),
  status text not null default 'active' check (status in ('active', 'removed')),
  appointed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, user_id),
  constraint organisation_members_org_fk foreign key (organisation_id, institution_id)
    references public.campus_organisations (id, institution_id) on delete cascade
);
create index organisation_members_user on public.organisation_members (user_id) where status = 'active';
create trigger organisation_members_updated_at before update on public.organisation_members
  for each row execute function private.set_updated_at();

create table public.organisation_follows (
  organisation_id uuid not null,
  institution_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id),
  constraint organisation_follows_org_fk foreign key (organisation_id, institution_id)
    references public.campus_organisations (id, institution_id) on delete cascade
);
create index organisation_follows_user on public.organisation_follows (user_id);

create table public.campus_posts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  organisation_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('official_announcement', 'src_programme', 'departmental_update', 'academic_notice', 'campus_news',
                                      'entertainment', 'workshop_seminar', 'sports', 'emergency_notice')),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  link_url text check (link_url is null or (link_url ~ '^https://[^\s]+$' and char_length(link_url) <= 500)),
  video_url text check (video_url is null or (video_url ~ '^https://[^\s]+$' and char_length(video_url) <= 500)),
  visibility text not null default 'school' check (visibility in ('school', 'public')),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden', 'removed')),
  publish_at timestamptz,
  pinned_until timestamptz,
  is_emergency boolean generated always as (kind = 'emergency_notice') stored,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_posts_id_institution_key unique (id, institution_id),
  constraint campus_posts_org_fk foreign key (organisation_id, institution_id)
    references public.campus_organisations (id, institution_id),
  constraint campus_posts_publish_at check (status not in ('published', 'hidden') or publish_at is not null),
  constraint campus_posts_removed_at check ((status = 'removed') = (removed_at is not null))
);
create index campus_posts_feed on public.campus_posts (institution_id, publish_at desc, id desc) where status = 'published';
create index campus_posts_organisation on public.campus_posts (organisation_id, publish_at desc, id desc);
create trigger campus_posts_updated_at before update on public.campus_posts
  for each row execute function private.set_updated_at();

create table public.post_media (
  post_id uuid not null,
  institution_id uuid not null,
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/post/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  position smallint not null check (position between 1 and 6),
  created_at timestamptz not null default now(),
  primary key (post_id, position),
  constraint post_media_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade,
  constraint post_media_path_school check (split_part(path, '/', 1) = institution_id::text)
);

create table public.post_likes (
  post_id uuid not null,
  institution_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint post_likes_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade
);
create index post_likes_user on public.post_likes (user_id);

create table public.post_saves (
  post_id uuid not null,
  institution_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint post_saves_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade
);
create index post_saves_user on public.post_saves (user_id, created_at desc);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  institution_id uuid not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_comments_id_institution_key unique (id, institution_id),
  constraint post_comments_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade
);
create index post_comments_post on public.post_comments (post_id, created_at);
create index post_comments_author on public.post_comments (author_id);
create trigger post_comments_updated_at before update on public.post_comments
  for each row execute function private.set_updated_at();

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id),
  post_id uuid,
  comment_id uuid,
  organisation_id uuid,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'misleading', 'impersonation', 'inappropriate', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_reports_one_target check (num_nonnulls(post_id, comment_id, organisation_id) = 1),
  constraint content_reports_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade,
  constraint content_reports_comment_fk foreign key (comment_id, institution_id)
    references public.post_comments (id, institution_id) on delete cascade,
  constraint content_reports_org_fk foreign key (organisation_id, institution_id)
    references public.campus_organisations (id, institution_id) on delete cascade
);
create unique index content_reports_once on public.content_reports (reporter_id, coalesce(post_id, comment_id, organisation_id))
  where reporter_id is not null;
create index content_reports_open on public.content_reports (created_at, id) where status = 'open';

-- Files due for removal from the campus-media bucket (done by the daily job).
create table public.campus_media_purge (
  path text primary key check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(post|logo)/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  due_at timestamptz not null,
  claimed_at timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  purged_at timestamptz,
  created_at timestamptz not null default now()
);
create index campus_media_purge_due on public.campus_media_purge (due_at) where purged_at is null;

-- Triggers ---------------------------------------------------------------------------

create function private.campus_agreement_active(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campus_agreements a
    where a.institution_id = p_institution_id
      and a.signed_on <= current_date
      and (a.ends_on is null or a.ends_on > current_date));
$$;

-- An administration organisation can only be created (or become one) while the
-- school has an active agreement. Checked at write time only; reads re-check.
create function private.guard_campus_organisation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'administration'
     and (tg_op = 'INSERT' or old.kind is distinct from new.kind)
     and not private.campus_agreement_active(new.institution_id) then
    raise exception 'agreement_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger campus_organisations_guard before insert or update of kind on public.campus_organisations
  for each row execute function private.guard_campus_organisation();

-- Once a post is live its place in every feed is fixed: publish_at can't move.
create function private.guard_campus_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publish_at is not null and old.publish_at <= now() and old.status <> 'draft'
     and new.publish_at is distinct from old.publish_at then
    raise exception 'post_already_live' using errcode = 'P0001';
  end if;
  if new.institution_id is distinct from old.institution_id or new.organisation_id is distinct from old.organisation_id then
    raise exception 'post_owner_fixed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger campus_posts_guard before update on public.campus_posts
  for each row execute function private.guard_campus_post();

-- Helpers ----------------------------------------------------------------------------

create function private.campus_switch(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.setting_int(p_key, 0) >= 1;
$$;

create function private.campus_staff_run(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in ('faculty', 'department', 'administration');
$$;

-- Is this user a verified student (not suspended, not expired) of this school?
create function private.student_verified_at(p_user_id uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.student_state(p_user_id) = 'verified', false)
     and exists (select 1 from public.student_profiles sp where sp.user_id = p_user_id and sp.institution_id = p_institution_id);
$$;

create function private.caller_verified_at(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and private.student_verified_at((select auth.uid()), p_institution_id);
$$;

-- The caller's effective role in an organisation, or null. A membership gives no
-- power if the organisation is archived, the caller is suspended, or (for
-- student-run kinds) the caller is no longer a verified student of that school.
create function private.organisation_role(p_organisation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organisation_members m
  join public.campus_organisations o on o.id = m.organisation_id
  where m.organisation_id = p_organisation_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and o.status <> 'archived'
    and not private.is_suspended()
    and (private.campus_staff_run(o.kind) or private.student_verified_at(m.user_id, o.institution_id));
$$;

create function private.organisation_badge(p_organisation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when o.status <> 'verified' then null
           when o.kind in ('faculty', 'department', 'administration') and private.campus_agreement_active(o.institution_id)
             then 'university_official'
           else 'verified'
         end
  from public.campus_organisations o where o.id = p_organisation_id;
$$;

-- Can this organisation's content be shown at all right now?
create function private.organisation_is_live(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.status = 'verified'
       and private.institution_is_listed(o.institution_id)
       and (o.kind <> 'administration' or private.campus_agreement_active(o.institution_id))
    from public.campus_organisations o where o.id = p_organisation_id), false);
$$;

-- Can the caller publish for this organisation right now? Members with an editing
-- role, or a Perqly admin with two-factor (audited as such).
create function private.can_publish(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_switch('campus.posts_enabled')
     and private.organisation_is_live(p_organisation_id)
     and (coalesce(private.organisation_role(p_organisation_id), '') in ('owner', 'admin', 'editor')
          or private.is_staff('admin'));
$$;

-- One rule for "is this post visible to readers now". No job changes any status:
-- a future publish_at simply isn't live yet.
create function private.post_is_live(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.status = 'published' and p.publish_at <= now() and private.organisation_is_live(p.organisation_id)
    from public.campus_posts p where p.id = p_post_id), false);
$$;

-- School-only and public posts, read inside the app: verified students of that school.
create function private.can_read_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_switch('campus.posts_enabled')
     and private.post_is_live(p_post_id)
     and exists (select 1 from public.campus_posts p where p.id = p_post_id and private.caller_verified_at(p.institution_id));
$$;

-- Editors see their organisation's posts in any state except removed.
create function private.can_edit_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.campus_posts p where p.id = p_post_id and p.status <> 'removed' and private.can_publish(p.organisation_id));
$$;

create function private.can_read_organisation(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_switch('campus.posts_enabled')
     and (
       (private.organisation_is_live(p_organisation_id)
        and exists (select 1 from public.campus_organisations o
                    where o.id = p_organisation_id and private.caller_verified_at(o.institution_id)))
       or private.organisation_role(p_organisation_id) is not null);
$$;

-- campus-media paths: <institution>/<organisation>/<post|logo>/<uuid>.<ext>
create function private.campus_media_organisation(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(post|logo)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
              then split_part(p_name, '/', 2)::uuid end;
$$;

create function private.campus_media_path_ok(p_name text, p_organisation_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_media_organisation(p_name) = p_organisation_id
     and split_part(p_name, '/', 3) = p_kind
     and exists (select 1 from public.campus_organisations o
                 where o.id = p_organisation_id and split_part(p_name, '/', 1) = o.institution_id::text);
$$;

create function private.can_write_campus_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_media_organisation(p_name) is not null
     and (private.campus_media_path_ok(p_name, private.campus_media_organisation(p_name), 'post')
          or private.campus_media_path_ok(p_name, private.campus_media_organisation(p_name), 'logo'))
     and private.can_publish(private.campus_media_organisation(p_name));
$$;

-- Read a file: Perqly support; members of its organisation; or a verified student of
-- that school when the file is the logo of a live organisation or belongs to a post
-- they can read. Signed-out visitors never read through Storage (the server signs
-- public post images after public_post confirms the post is public).
create function private.can_read_campus_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_media_organisation(p_name) is not null
     and (
       private.is_staff('support')
       or private.organisation_role(private.campus_media_organisation(p_name)) is not null
       or exists (select 1 from public.post_media m where m.path = p_name and private.can_read_post(m.post_id))
       or exists (select 1 from public.campus_organisations o
                  where o.logo_path = p_name and private.can_read_organisation(o.id)));
$$;

-- An editor may delete their own organisation's upload only while nothing uses it.
create function private.can_delete_campus_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write_campus_media(p_name)
     and not exists (select 1 from public.post_media m where m.path = p_name)
     and not exists (select 1 from public.campus_organisations o where o.logo_path = p_name)
     and not exists (select 1 from public.campus_media_purge q where q.path = p_name);
$$;

create function private.campus_require(p_switch text default 'campus.posts_enabled')
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.campus_switch('campus.posts_enabled') or not private.campus_switch(p_switch) then
    raise exception 'campus_disabled' using errcode = 'P0001';
  end if;
  if private.is_suspended() then raise exception 'account_suspended' using errcode = 'P0001'; end if;
end;
$$;

create function private.queue_campus_media(p_path text, p_due timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.campus_media_purge (path, due_at) values (p_path, p_due)
  on conflict (path) do nothing;
$$;

-- In-app notifications for a newly live post. Push and email are 'skipped' from the
-- start, so claim_notification_deliveries never selects them (C1 sends no push or email).
create function private.notify_campus(p_post_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.campus_posts;
  v_org public.campus_organisations;
  v_count int;
begin
  select * into v_post from public.campus_posts where id = p_post_id;
  select * into v_org from public.campus_organisations where id = v_post.organisation_id;
  insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
  select sp.user_id,
         case when v_post.is_emergency then 'campus.emergency' else 'campus.post' end,
         left(v_org.name || ': ' || v_post.title, 140),
         left(v_post.body, 200),
         '/student/campus/posts/' || v_post.id,
         'skipped', 'skipped'
  from public.student_profiles sp
  where sp.institution_id = v_post.institution_id
    and sp.user_id is distinct from v_post.author_id
    and private.student_state(sp.user_id) = 'verified'
    and (v_post.is_emergency
         or exists (select 1 from public.organisation_follows f where f.organisation_id = v_post.organisation_id and f.user_id = sp.user_id));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- JSON for a post, as students and members see it. Never an author's name.
create function private.campus_post_json(p_post_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'title', p.title,
    'body', p.body,
    'link_url', p.link_url,
    'video_url', p.video_url,
    'visibility', p.visibility,
    'status', p.status,
    'publish_at', p.publish_at,
    'pinned_until', p.pinned_until,
    'is_emergency', p.is_emergency,
    'organisation', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'kind', o.kind, 'logo_path', o.logo_path,
                                       'badge', private.organisation_badge(o.id)),
    'media', coalesce((select jsonb_agg(m.path order by m.position) from public.post_media m where m.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.post_comments c where c.post_id = p.id and c.status = 'visible'),
    'liked', p_viewer is not null and exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_viewer),
    'saved', p_viewer is not null and exists (select 1 from public.post_saves s where s.post_id = p.id and s.user_id = p_viewer))
  from public.campus_posts p
  join public.campus_organisations o on o.id = p.organisation_id
  where p.id = p_post_id;
$$;

-- The same, for signed-out visitors: no counts per person, no viewer state.
create function private.campus_public_post_json(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'title', p.title, 'body', p.body, 'link_url', p.link_url, 'video_url', p.video_url,
    'publish_at', p.publish_at, 'is_emergency', p.is_emergency,
    'organisation', jsonb_build_object('name', o.name, 'slug', o.slug, 'kind', o.kind, 'logo_path', o.logo_path,
                                       'badge', private.organisation_badge(o.id), 'school_slug', i.slug, 'school', i.short_name),
    'media', coalesce((select jsonb_agg(m.path order by m.position) from public.post_media m where m.post_id = p.id), '[]'::jsonb))
  from public.campus_posts p
  join public.campus_organisations o on o.id = p.organisation_id
  join public.institutions i on i.id = p.institution_id
  where p.id = p_post_id;
$$;

-- Row-level security -----------------------------------------------------------------
alter table public.campus_agreements enable row level security;
alter table public.campus_organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.organisation_follows enable row level security;
alter table public.campus_posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.post_comments enable row level security;
alter table public.content_reports enable row level security;
alter table public.campus_media_purge enable row level security;

revoke all on table public.campus_agreements, public.campus_organisations, public.organisation_members, public.organisation_follows,
  public.campus_posts, public.post_media, public.post_likes, public.post_saves, public.post_comments, public.content_reports,
  public.campus_media_purge
  from anon, authenticated, service_role;
grant select on table public.campus_organisations, public.organisation_members, public.organisation_follows,
  public.campus_posts, public.post_media, public.post_likes, public.post_saves
  to authenticated;

create policy "school readers and members see organisations" on public.campus_organisations
  for select to authenticated using ((select private.can_read_organisation(id)) or (select private.is_staff('support')));
create policy "school readers see representatives; members see their team" on public.organisation_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or (status = 'active' and (select private.can_read_organisation(organisation_id)))
    or (select private.is_staff('support')));
create policy "people see their own follows" on public.organisation_follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy "readers see live posts; editors see their own" on public.campus_posts
  for select to authenticated using (
    (select private.can_read_post(id)) or (select private.can_edit_post(id)) or (select private.is_staff('support')));
create policy "post images follow their post" on public.post_media
  for select to authenticated using (
    (select private.can_read_post(post_id)) or (select private.can_edit_post(post_id)) or (select private.is_staff('support')));
create policy "people see their own likes" on public.post_likes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "people see their own saves" on public.post_saves
  for select to authenticated using (user_id = (select auth.uid()));

-- Storage ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-media', 'campus-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "editors upload campus images" on storage.objects
  for insert to authenticated with check (bucket_id = 'campus-media' and (select private.can_write_campus_media(name)));
create policy "campus images follow their post or organisation" on storage.objects
  for select to authenticated using (bucket_id = 'campus-media' and (select private.can_read_campus_media(name)));
create policy "editors remove unused campus uploads" on storage.objects
  for delete to authenticated using (bucket_id = 'campus-media' and (select private.can_delete_campus_media(name)));
-- No update policy: an image is never replaced in place.

-- Perqly admin: agreements, switches, organisations, members --------------------------
-- These work while Campus is switched off, so organisations can be prepared.

create function public.admin_record_campus_agreement(p_institution_id uuid, p_signed_on date, p_ends_on date,
                                                     p_signed_by_name text, p_document_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select to_jsonb(a) into v_before from public.campus_agreements a where a.institution_id = p_institution_id for update;
  insert into public.campus_agreements (institution_id, signed_on, ends_on, signed_by_name, document_ref, recorded_by)
  values (p_institution_id, p_signed_on, p_ends_on, btrim(p_signed_by_name), btrim(p_document_ref), (select auth.uid()))
  on conflict (institution_id) do update
    set signed_on = excluded.signed_on, ends_on = excluded.ends_on, signed_by_name = excluded.signed_by_name,
        document_ref = excluded.document_ref, recorded_by = excluded.recorded_by, recorded_at = now();
  perform private.write_audit('campus.agreement_recorded', 'platform:super_admin', 'campus_agreement', p_institution_id,
    v_before, (select to_jsonb(a) from public.campus_agreements a where a.institution_id = p_institution_id), '{}'::jsonb, p_institution_id);
end;
$$;

create function public.admin_end_campus_agreement(p_institution_id uuid, p_ends_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select to_jsonb(a) into v_before from public.campus_agreements a where a.institution_id = p_institution_id for update;
  if v_before is null then raise exception 'agreement_not_found' using errcode = 'P0001'; end if;
  update public.campus_agreements set ends_on = p_ends_on where institution_id = p_institution_id;
  perform private.write_audit('campus.agreement_ended', 'platform:super_admin', 'campus_agreement', p_institution_id,
    v_before, (select to_jsonb(a) from public.campus_agreements a where a.institution_id = p_institution_id), '{}'::jsonb, p_institution_id);
end;
$$;

create function public.admin_set_campus_switch(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_key not in ('campus.posts_enabled', 'campus.comments_enabled') or p_on is null then
    raise exception 'setting_not_tunable' using errcode = 'P0001';
  end if;
  select value into v_before from private.app_settings where key = p_key for update;
  update private.app_settings set value = to_jsonb(case when p_on then 1 else 0 end), updated_by = (select auth.uid()) where key = p_key;
  perform private.write_audit('platform.setting_changed', 'platform:super_admin', 'app_setting', null,
    jsonb_build_object('key', p_key, 'value', v_before), jsonb_build_object('key', p_key, 'value', case when p_on then 1 else 0 end));
end;
$$;

create function public.admin_create_organisation(p_institution_id uuid, p_kind text, p_name text, p_slug text,
                                                 p_campus_id uuid default null, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not private.institution_is_listed(p_institution_id) then raise exception 'institution_not_listed' using errcode = 'P0001'; end if;
  begin
    insert into public.campus_organisations (institution_id, campus_id, kind, name, slug, description, created_by)
    values (p_institution_id, p_campus_id, p_kind, btrim(p_name), lower(btrim(p_slug)), nullif(btrim(p_description), ''), (select auth.uid()))
    returning id into v_id;
  exception
    when unique_violation then raise exception 'slug_taken' using errcode = 'P0001';
    when foreign_key_violation then raise exception 'campus_invalid' using errcode = 'P0001';
    when check_violation then raise exception 'organisation_invalid' using errcode = 'P0001';
  end;
  perform private.write_audit('campus.organisation_created', 'platform:admin', 'campus_organisation', v_id, null,
    jsonb_build_object('kind', p_kind, 'name', btrim(p_name)), '{}'::jsonb, p_institution_id);
  return v_id;
end;
$$;

-- verified (or re-verified after suspension), suspended, archived (final).
create function public.admin_set_organisation_status(p_organisation_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org public.campus_organisations;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_org from public.campus_organisations where id = p_organisation_id for update;
  if v_org.id is null then raise exception 'organisation_not_found' using errcode = 'P0001'; end if;
  if v_org.status = 'archived' or p_status not in ('verified', 'suspended', 'archived') then
    raise exception 'status_invalid' using errcode = 'P0001';
  end if;
  if p_status = 'verified' then
    update public.campus_organisations
       set status = 'verified', verified_by = (select auth.uid()), verified_at = coalesce(verified_at, now())
     where id = p_organisation_id;
  else
    update public.campus_organisations set status = p_status where id = p_organisation_id;
  end if;
  if p_status = 'archived' then
    update public.campus_posts set status = 'removed', removed_at = now(), pinned_until = null
     where organisation_id = p_organisation_id and status <> 'removed';
    perform private.queue_campus_media(m.path, now() + interval '30 days')
      from public.post_media m join public.campus_posts p on p.id = m.post_id where p.organisation_id = p_organisation_id;
    if v_org.logo_path is not null then perform private.queue_campus_media(v_org.logo_path, now() + interval '30 days'); end if;
  end if;
  perform private.write_audit('campus.organisation_' || p_status, 'platform:admin', 'campus_organisation', p_organisation_id,
    jsonb_build_object('status', v_org.status), jsonb_build_object('status', p_status), '{}'::jsonb, v_org.institution_id);
end;
$$;

-- Appoint or change a member. Student-run organisations take only verified students
-- of the same school; staff-run ones (faculty, department, administration) take any
-- account that isn't suspended, and only through this function.
create function private.set_member(p_organisation_id uuid, p_user_id uuid, p_role text, p_title text, p_context text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.campus_organisations;
  v_before jsonb;
begin
  select * into v_org from public.campus_organisations where id = p_organisation_id for update;
  if v_org.id is null or v_org.status = 'archived' then raise exception 'organisation_not_found' using errcode = 'P0001'; end if;
  if p_role not in ('owner', 'admin', 'editor') then raise exception 'role_invalid' using errcode = 'P0001'; end if;
  if p_user_id is null
     or exists (select 1 from public.profiles p where p.id = p_user_id and p.is_suspended)
     or not exists (select 1 from public.profiles p where p.id = p_user_id)
     or (not private.campus_staff_run(v_org.kind) and not private.student_verified_at(p_user_id, v_org.institution_id)) then
    raise exception 'member_not_eligible' using errcode = 'P0001';
  end if;
  select jsonb_build_object('role', m.role, 'status', m.status) into v_before
    from public.organisation_members m where m.organisation_id = p_organisation_id and m.user_id = p_user_id;
  if v_before is not null and v_before ->> 'status' = 'active' and v_before ->> 'role' = 'owner' and p_role <> 'owner'
     and (select count(*) from public.organisation_members m
           where m.organisation_id = p_organisation_id and m.role = 'owner' and m.status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  insert into public.organisation_members (organisation_id, institution_id, user_id, role, title, status, appointed_by)
  values (p_organisation_id, v_org.institution_id, p_user_id, p_role, nullif(btrim(p_title), ''), 'active', (select auth.uid()))
  on conflict (organisation_id, user_id) do update
    set role = excluded.role, title = excluded.title, status = 'active', appointed_by = excluded.appointed_by;
  perform private.write_audit('campus.member_set', p_context, 'campus_organisation', p_organisation_id, v_before,
    jsonb_build_object('user_id', p_user_id, 'role', p_role, 'title', p_title), '{}'::jsonb, v_org.institution_id);
end;
$$;

create function public.admin_set_organisation_member(p_organisation_id uuid, p_user_id uuid, p_role text, p_title text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform private.set_member(p_organisation_id, p_user_id, p_role, p_title, 'platform:admin');
end;
$$;

-- Find a person for an admin by their sign-in email (admins only).
create function public.admin_find_user_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)));
end;
$$;

create function private.remove_member(p_organisation_id uuid, p_user_id uuid, p_context text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_member public.organisation_members;
begin
  select * into v_member from public.organisation_members
   where organisation_id = p_organisation_id and user_id = p_user_id and status = 'active' for update;
  if v_member.user_id is null then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  if v_member.role = 'owner'
     and (select count(*) from public.organisation_members m
           where m.organisation_id = p_organisation_id and m.role = 'owner' and m.status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  update public.organisation_members set status = 'removed' where organisation_id = p_organisation_id and user_id = p_user_id;
  perform private.write_audit('campus.member_removed', p_context, 'campus_organisation', p_organisation_id,
    jsonb_build_object('user_id', p_user_id, 'role', v_member.role), null, '{}'::jsonb, v_member.institution_id);
end;
$$;

create function public.admin_remove_organisation_member(p_organisation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform private.remove_member(p_organisation_id, p_user_id, 'platform:admin');
end;
$$;

create function public.admin_list_organisations(p_institution_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'institution_id', o.institution_id, 'school', i.short_name, 'kind', o.kind, 'name', o.name, 'slug', o.slug,
             'status', o.status, 'badge', private.organisation_badge(o.id),
             'owners', (select count(*) from public.organisation_members m where m.organisation_id = o.id and m.role = 'owner' and m.status = 'active'),
             'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name, 'role', m.role, 'title', m.title)
                                                   order by m.role, p.full_name)
                                  from public.organisation_members m join public.profiles p on p.id = m.user_id
                                  where m.organisation_id = o.id and m.status = 'active'), '[]'::jsonb))
           order by i.short_name, o.name)
    from public.campus_organisations o join public.institutions i on i.id = o.institution_id
    where p_institution_id is null or o.institution_id = p_institution_id), '[]'::jsonb);
end;
$$;

-- Organisation owners and admins -------------------------------------------------------

create function private.require_org_manager(p_organisation_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_role text;
begin
  perform private.campus_require();
  v_role := private.organisation_role(p_organisation_id);
  if coalesce(v_role, '') not in ('owner', 'admin') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return v_role;
end;
$$;

create function public.update_organisation(p_organisation_id uuid, p_description text, p_contact_email text, p_contact_phone text,
                                           p_logo_path text, p_campus_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.campus_organisations;
begin
  perform private.require_org_manager(p_organisation_id);
  select * into v_org from public.campus_organisations where id = p_organisation_id for update;
  if p_logo_path is not null and p_logo_path is distinct from v_org.logo_path then
    if not private.campus_media_path_ok(p_logo_path, p_organisation_id, 'logo')
       or not exists (select 1 from storage.objects s where s.bucket_id = 'campus-media' and s.name = p_logo_path) then
      raise exception 'image_missing' using errcode = 'P0001';
    end if;
  end if;
  begin
    update public.campus_organisations
       set description = nullif(btrim(p_description), ''),
           contact_email = nullif(btrim(p_contact_email), ''),
           contact_phone = nullif(btrim(p_contact_phone), ''),
           logo_path = p_logo_path,
           campus_id = p_campus_id
     where id = p_organisation_id;
  exception
    when check_violation then raise exception 'organisation_invalid' using errcode = 'P0001';
    when foreign_key_violation then raise exception 'campus_invalid' using errcode = 'P0001';
  end;
  if v_org.logo_path is not null and v_org.logo_path is distinct from p_logo_path then
    perform private.queue_campus_media(v_org.logo_path, now());
  end if;
  perform private.write_audit('campus.organisation_updated', 'organisation:manager', 'campus_organisation', p_organisation_id,
    jsonb_build_object('logo_path', v_org.logo_path), jsonb_build_object('logo_path', p_logo_path), '{}'::jsonb, v_org.institution_id);
end;
$$;

-- Owners and admins add verified students of the same school by their sign-in email.
-- The same answer is given whether the address is unknown or not eligible.
create function public.set_organisation_member(p_organisation_id uuid, p_email text, p_role text, p_title text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_org_manager(p_organisation_id);
  v_kind text;
  v_user uuid;
  v_current text;
begin
  select kind into v_kind from public.campus_organisations where id = p_organisation_id;
  if private.campus_staff_run(v_kind) then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if v_role = 'admin' and p_role = 'owner' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('campus.member_set', 20, interval '1 day', 'org:' || p_organisation_id);
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then raise exception 'member_not_eligible' using errcode = 'P0001'; end if;
  select m.role into v_current from public.organisation_members m
   where m.organisation_id = p_organisation_id and m.user_id = v_user and m.status = 'active';
  if v_role = 'admin' and v_current = 'owner' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform private.set_member(p_organisation_id, v_user, p_role, p_title, 'organisation:' || v_role);
end;
$$;

create function public.remove_organisation_member(p_organisation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_org_manager(p_organisation_id);
  v_kind text;
begin
  select kind into v_kind from public.campus_organisations where id = p_organisation_id;
  if private.campus_staff_run(v_kind) then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if v_role = 'admin' and exists (select 1 from public.organisation_members m
                                   where m.organisation_id = p_organisation_id and m.user_id = p_user_id and m.role = 'owner') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  perform private.remove_member(p_organisation_id, p_user_id, 'organisation:' || v_role);
end;
$$;

create function public.organisation_members_for_manager(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_manager(p_organisation_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name, 'role', m.role, 'title', m.title) order by m.role, p.full_name)
    from public.organisation_members m join public.profiles p on p.id = m.user_id
    where m.organisation_id = p_organisation_id and m.status = 'active'), '[]'::jsonb);
end;
$$;

create function public.organisation_for_editor(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_publish(p_organisation_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select jsonb_build_object(
            'id', o.id, 'institution_id', o.institution_id, 'kind', o.kind, 'name', o.name, 'slug', o.slug, 'description', o.description,
            'logo_path', o.logo_path, 'contact_email', o.contact_email, 'contact_phone', o.contact_phone, 'campus_id', o.campus_id,
            'status', o.status, 'badge', private.organisation_badge(o.id),
            'my_role', coalesce(private.organisation_role(o.id), case when private.is_staff('admin') then 'perqly_admin' end),
            'can_post_emergency', private.is_staff('admin') or private.organisation_badge(o.id) = 'university_official')
          from public.campus_organisations o where o.id = p_organisation_id);
end;
$$;

-- Memberships of the caller (for the Organise area). Read-only, own rows only.
create function public.my_organisations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'slug', o.slug, 'kind', o.kind, 'status', o.status, 'logo_path', o.logo_path,
           'badge', private.organisation_badge(o.id), 'role', m.role, 'title', m.title,
           'effective_role', private.organisation_role(o.id), 'live', private.organisation_is_live(o.id))
         order by o.name), '[]'::jsonb)
  from public.organisation_members m
  join public.campus_organisations o on o.id = m.organisation_id
  where m.user_id = (select auth.uid()) and m.status = 'active' and o.status <> 'archived';
$$;

-- Posts: editors -------------------------------------------------------------------------

create function public.save_post(p_post_id uuid, p_organisation_id uuid, p_kind text, p_title text, p_body text,
                                 p_link_url text default null, p_video_url text default null, p_visibility text default 'school',
                                 p_media text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.campus_posts;
  v_org public.campus_organisations;
  v_id uuid := p_post_id;
  v_path text;
  v_media text[] := coalesce(p_media, '{}');
  v_pos int := 0;
begin
  perform private.campus_require();
  if p_post_id is not null then
    select * into v_post from public.campus_posts where id = p_post_id for update;
    if v_post.id is null or v_post.organisation_id <> p_organisation_id or v_post.status = 'removed' then
      raise exception 'post_not_found' using errcode = 'P0001';
    end if;
  end if;
  if not private.can_publish(p_organisation_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_org from public.campus_organisations where id = p_organisation_id;
  if p_kind = 'emergency_notice' and not (private.is_staff('admin') or private.organisation_badge(p_organisation_id) = 'university_official') then
    raise exception 'emergency_not_allowed' using errcode = 'P0001';
  end if;
  if cardinality(v_media) > 6 or (select count(distinct x) from unnest(v_media) x) <> cardinality(v_media) then
    raise exception 'post_invalid' using errcode = 'P0001';
  end if;
  foreach v_path in array v_media loop
    if not private.campus_media_path_ok(v_path, p_organisation_id, 'post')
       or not exists (select 1 from storage.objects s where s.bucket_id = 'campus-media' and s.name = v_path)
       or exists (select 1 from public.post_media m where m.path = v_path and m.post_id is distinct from p_post_id)
       or exists (select 1 from public.campus_media_purge q where q.path = v_path) then
      raise exception 'image_missing' using errcode = 'P0001';
    end if;
  end loop;
  begin
    if p_post_id is null then
      insert into public.campus_posts (institution_id, organisation_id, author_id, kind, title, body, link_url, video_url, visibility)
      values (v_org.institution_id, p_organisation_id, (select auth.uid()), p_kind, btrim(p_title), btrim(p_body),
              nullif(btrim(p_link_url), ''), nullif(btrim(p_video_url), ''), coalesce(p_visibility, 'school'))
      returning id into v_id;
    else
      update public.campus_posts
         set kind = p_kind, title = btrim(p_title), body = btrim(p_body), link_url = nullif(btrim(p_link_url), ''),
             video_url = nullif(btrim(p_video_url), ''), visibility = coalesce(p_visibility, 'school')
       where id = p_post_id;
    end if;
  exception when check_violation or not_null_violation then
    raise exception 'post_invalid' using errcode = 'P0001';
  end;
  -- Images no longer used by this post go to the removal queue straight away.
  perform private.queue_campus_media(m.path, now())
     from public.post_media m where m.post_id = v_id and not (m.path = any (v_media));
  delete from public.post_media where post_id = v_id;
  foreach v_path in array v_media loop
    v_pos := v_pos + 1;
    insert into public.post_media (post_id, institution_id, path, position) values (v_id, v_org.institution_id, v_path, v_pos);
  end loop;
  perform private.write_audit(case when p_post_id is null then 'campus.post_created' else 'campus.post_edited' end,
    case when private.organisation_role(p_organisation_id) is null then 'platform:admin' else 'organisation:editor' end,
    'campus_post', v_id, null, jsonb_build_object('kind', p_kind, 'title', btrim(p_title)), '{}'::jsonb, v_org.institution_id);
  return v_id;
end;
$$;

-- Publish now (p_publish_at null) or schedule up to 60 days ahead. A post that is
-- already live can't be rescheduled.
create function public.publish_post(p_post_id uuid, p_publish_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.campus_posts;
  v_at timestamptz;
  v_notified int := 0;
begin
  perform private.campus_require();
  select * into v_post from public.campus_posts where id = p_post_id for update;
  if v_post.id is null or not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if v_post.status not in ('draft', 'published') then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  if v_post.status = 'published' and v_post.publish_at <= now() then raise exception 'post_already_live' using errcode = 'P0001'; end if;
  v_at := coalesce(p_publish_at, now());
  if v_at < now() - interval '1 minute' or v_at > now() + interval '60 days' then
    raise exception 'publish_time_invalid' using errcode = 'P0001';
  end if;
  if v_at < now() then v_at := now(); end if;
  perform private.check_rate_limit('campus.post_published', private.setting_int('campus.posts_per_org_per_day', 10), interval '1 day',
                                   'org:' || v_post.organisation_id);
  update public.campus_posts set status = 'published', publish_at = v_at where id = p_post_id;
  if v_at <= now() then v_notified := private.notify_campus(p_post_id); end if;
  perform private.write_audit(case when v_at <= now() then 'campus.post_published' else 'campus.post_scheduled' end,
    case when private.organisation_role(v_post.organisation_id) is null then 'platform:admin' else 'organisation:editor' end,
    'campus_post', p_post_id, jsonb_build_object('status', v_post.status, 'publish_at', v_post.publish_at),
    jsonb_build_object('status', 'published', 'publish_at', v_at), '{}'::jsonb, v_post.institution_id);
  return jsonb_build_object('publish_at', v_at, 'live', v_at <= now(), 'notified', v_notified);
end;
$$;

-- hidden <-> published (reversible), back to draft (only before it is live), removed (final).
create function public.set_post_status(p_post_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_post public.campus_posts;
begin
  perform private.campus_require();
  select * into v_post from public.campus_posts where id = p_post_id for update;
  if v_post.id is null or not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not ((p_status = 'hidden' and v_post.status = 'published')
          or (p_status = 'published' and v_post.status = 'hidden')
          or (p_status = 'draft' and v_post.status = 'published' and v_post.publish_at > now())
          or (p_status = 'removed' and v_post.status <> 'removed')) then
    raise exception 'status_invalid' using errcode = 'P0001';
  end if;
  update public.campus_posts
     set status = p_status,
         publish_at = case when p_status = 'draft' then null else publish_at end,
         removed_at = case when p_status = 'removed' then now() else null end,
         pinned_until = case when p_status in ('removed', 'draft') then null else pinned_until end
   where id = p_post_id;
  if p_status = 'removed' then
    perform private.queue_campus_media(m.path, now() + interval '30 days') from public.post_media m where m.post_id = p_post_id;
  end if;
  perform private.write_audit('campus.post_' || p_status,
    case when private.organisation_role(v_post.organisation_id) is null then 'platform:admin' else 'organisation:editor' end,
    'campus_post', p_post_id, jsonb_build_object('status', v_post.status), jsonb_build_object('status', p_status), '{}'::jsonb, v_post.institution_id);
end;
$$;

create function public.set_post_pin(p_post_id uuid, p_pinned_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_post public.campus_posts;
begin
  perform private.campus_require();
  select * into v_post from public.campus_posts where id = p_post_id for update;
  if v_post.id is null or not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if p_pinned_until is not null and (v_post.status <> 'published' or p_pinned_until <= now() or p_pinned_until > now() + interval '30 days') then
    raise exception 'pin_invalid' using errcode = 'P0001';
  end if;
  update public.campus_posts set pinned_until = p_pinned_until where id = p_post_id;
  perform private.write_audit(case when p_pinned_until is null then 'campus.post_unpinned' else 'campus.post_pinned' end,
    'organisation:editor', 'campus_post', p_post_id, null, jsonb_build_object('pinned_until', p_pinned_until), '{}'::jsonb, v_post.institution_id);
end;
$$;

create function public.organisation_posts_for_editor(p_organisation_id uuid, p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_publish(p_organisation_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(private.campus_post_json(x.id, (select auth.uid())) || jsonb_build_object('created_at', x.created_at)
                     order by x.created_at desc, x.id desc)
    from (select p.id, p.created_at from public.campus_posts p
          where p.organisation_id = p_organisation_id and p.status <> 'removed'
            and (p_after_at is null or (p.created_at, p.id) < (p_after_at, p_after_id))
          order by p.created_at desc, p.id desc limit 30) x), '[]'::jsonb);
end;
$$;

-- Students: follow, like, save, comment, report ------------------------------------------

create function public.follow_organisation(p_organisation_id uuid, p_follow boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_institution uuid;
begin
  perform private.campus_require();
  select o.institution_id into v_institution from public.campus_organisations o where o.id = p_organisation_id;
  if v_institution is null or not private.organisation_is_live(p_organisation_id) or not private.caller_verified_at(v_institution) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_follow then
    insert into public.organisation_follows (organisation_id, institution_id, user_id)
    values (p_organisation_id, v_institution, (select auth.uid())) on conflict do nothing;
  else
    delete from public.organisation_follows where organisation_id = p_organisation_id and user_id = (select auth.uid());
  end if;
end;
$$;

create function public.set_post_like(p_post_id uuid, p_like boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_read_post(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_like then
    insert into public.post_likes (post_id, institution_id, user_id)
    select p.id, p.institution_id, (select auth.uid()) from public.campus_posts p where p.id = p_post_id on conflict do nothing;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = (select auth.uid());
  end if;
end;
$$;

create function public.set_post_save(p_post_id uuid, p_save boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_read_post(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_save then
    insert into public.post_saves (post_id, institution_id, user_id)
    select p.id, p.institution_id, (select auth.uid()) from public.campus_posts p where p.id = p_post_id on conflict do nothing;
  else
    delete from public.post_saves where post_id = p_post_id and user_id = (select auth.uid());
  end if;
end;
$$;

create function public.add_comment(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.campus_require('campus.comments_enabled');
  if not private.can_read_post(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('campus.comment', private.setting_int('campus.comments_per_student_per_hour', 30), interval '1 hour');
  begin
    insert into public.post_comments (post_id, institution_id, author_id, body)
    select p.id, p.institution_id, (select auth.uid()), btrim(p_body) from public.campus_posts p where p.id = p_post_id
    returning id into v_id;
  exception when check_violation or not_null_violation then
    raise exception 'comment_invalid' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

create function public.remove_own_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  update public.post_comments set status = 'removed'
   where id = p_comment_id and author_id = (select auth.uid()) and status <> 'removed';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end;
$$;

-- Editors hide comments on their own organisation's posts; Perqly support anywhere.
create function public.hide_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_comment public.post_comments;
begin
  select * into v_comment from public.post_comments where id = p_comment_id for update;
  if v_comment.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (private.is_staff('support') or private.can_edit_post(v_comment.post_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.post_comments set status = 'hidden' where id = p_comment_id and status = 'visible';
  perform private.write_audit('campus.comment_hidden', case when private.is_staff('support') then 'platform:support' else 'organisation:editor' end,
    'post_comment', p_comment_id, null, null, '{}'::jsonb, v_comment.institution_id);
end;
$$;

create function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_institution uuid;
  v_ok boolean := false;
begin
  perform private.campus_require();
  if p_target_type = 'post' then
    select p.institution_id, private.can_read_post(p.id) into v_institution, v_ok from public.campus_posts p where p.id = p_target_id;
  elsif p_target_type = 'comment' then
    select c.institution_id, (c.status = 'visible' and private.can_read_post(c.post_id)) into v_institution, v_ok
      from public.post_comments c where c.id = p_target_id;
  elsif p_target_type = 'organisation' then
    select o.institution_id, (private.organisation_is_live(o.id) and private.caller_verified_at(o.institution_id)) into v_institution, v_ok
      from public.campus_organisations o where o.id = p_target_id;
  end if;
  if not coalesce(v_ok, false) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('campus.report', private.setting_int('campus.reports_per_user_per_day', 20), interval '1 day');
  begin
    insert into public.content_reports (institution_id, post_id, comment_id, organisation_id, reporter_id, reason, note)
    values (v_institution,
            case when p_target_type = 'post' then p_target_id end,
            case when p_target_type = 'comment' then p_target_id end,
            case when p_target_type = 'organisation' then p_target_id end,
            (select auth.uid()), p_reason, nullif(btrim(p_note), ''));
  exception
    when unique_violation then raise exception 'already_reported' using errcode = 'P0001';
    when check_violation then raise exception 'report_invalid' using errcode = 'P0001';
  end;
end;
$$;

-- Moderation (Perqly support and admins, two-factor) -----------------------------------

create function public.moderation_queue(p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'created_at', r.created_at, 'reason', r.reason, 'note', r.note, 'school', i.short_name,
             'target_type', case when r.post_id is not null then 'post' when r.comment_id is not null then 'comment' else 'organisation' end,
             'target_id', coalesce(r.post_id, r.comment_id, r.organisation_id),
             'summary', coalesce((select p.title from public.campus_posts p where p.id = r.post_id),
                                 (select left(c.body, 200) from public.post_comments c where c.id = r.comment_id),
                                 (select o.name from public.campus_organisations o where o.id = r.organisation_id)),
             'reports_on_target', (select count(*) from public.content_reports r2
                                   where r2.status = 'open' and coalesce(r2.post_id, r2.comment_id, r2.organisation_id)
                                                              = coalesce(r.post_id, r.comment_id, r.organisation_id)))
           order by r.created_at, r.id)
    from (select * from public.content_reports r
          where r.status = 'open' and (p_after_at is null or (r.created_at, r.id) > (p_after_at, p_after_id))
          order by r.created_at, r.id limit 50) r
    join public.institutions i on i.id = r.institution_id), '[]'::jsonb);
end;
$$;

-- dismiss: nothing wrong. hide: post or comment hidden (reversible by staff later).
-- remove: post or comment removed. For an organisation: hide = suspend (admins only).
create function public.moderate_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.content_reports;
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into r from public.content_reports where id = p_report_id for update;
  if r.id is null or r.status <> 'open' then raise exception 'report_not_found' using errcode = 'P0001'; end if;
  if p_action not in ('dismiss', 'hide', 'remove') then raise exception 'action_invalid' using errcode = 'P0001'; end if;
  if p_action <> 'dismiss' then
    if r.post_id is not null then
      update public.campus_posts
         set status = case when p_action = 'remove' then 'removed' when status = 'published' then 'hidden' else status end,
             removed_at = case when p_action = 'remove' then coalesce(removed_at, now()) else removed_at end,
             pinned_until = null
       where id = r.post_id and status <> 'removed';
      if p_action = 'remove' then
        perform private.queue_campus_media(m.path, now() + interval '30 days') from public.post_media m where m.post_id = r.post_id;
      end if;
    elsif r.comment_id is not null then
      update public.post_comments set status = case when p_action = 'remove' then 'removed' else 'hidden' end where id = r.comment_id;
    else
      if p_action <> 'hide' or not (select private.is_staff('admin')) then raise exception 'action_invalid' using errcode = 'P0001'; end if;
      update public.campus_organisations set status = 'suspended' where id = r.organisation_id and status = 'verified';
    end if;
  end if;
  update public.content_reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end, resolved_by = (select auth.uid()), resolved_at = now()
   where status = 'open'
     and coalesce(post_id, comment_id, organisation_id) = coalesce(r.post_id, r.comment_id, r.organisation_id);
  perform private.write_audit('campus.report_' || case when p_action = 'dismiss' then 'dismissed' else 'actioned' end, 'platform:support',
    'content_report', p_report_id, null, jsonb_build_object('action', p_action), '{}'::jsonb, r.institution_id);
end;
$$;

-- Reading -------------------------------------------------------------------------------
-- Every list is cursor-paged on values that never change once a post is live:
-- (publish_at, id), newest first. The school always comes from the caller.

create function public.campus_enabled()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('posts', private.campus_switch('campus.posts_enabled'),
                            'comments', private.campus_switch('campus.posts_enabled') and private.campus_switch('campus.comments_enabled'));
$$;

-- Pinned and emergency posts, shown above the feed. Not paged; at most 10.
create function public.campus_highlights()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(x.id, (select auth.uid())) order by x.urgent desc, x.publish_at desc, x.id desc), '[]'::jsonb)
  from (select p.id, p.publish_at, (p.is_emergency and p.publish_at > now() - interval '72 hours') as urgent
        from public.campus_posts p
        where p.institution_id = (select private.my_institution())
          and p.status = 'published'
          and ((p.is_emergency and p.publish_at > now() - interval '72 hours') or p.pinned_until > now())
          and private.can_read_post(p.id)
        order by 3 desc, p.publish_at desc, p.id desc
        limit 10) x;
$$;

create function public.campus_feed(p_after_at timestamptz default null, p_after_id uuid default null, p_following_only boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(x.id, (select auth.uid())) order by x.publish_at desc, x.id desc), '[]'::jsonb)
  from (select p.id, p.publish_at
        from public.campus_posts p
        where p.institution_id = (select private.my_institution())
          and p.status = 'published'
          and private.can_read_post(p.id)
          and (not coalesce(p_following_only, false)
               or exists (select 1 from public.organisation_follows f
                          where f.organisation_id = p.organisation_id and f.user_id = (select auth.uid())))
          and (p_after_at is null or p_after_id is null or (p.publish_at, p.id) < (p_after_at, p_after_id))
        order by p.publish_at desc, p.id desc
        limit 30) x;
$$;

-- Signed in but not verified at their declared school: that school's public posts only.
create function public.campus_public_school_feed(p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_public_post_json(x.id) order by x.publish_at desc, x.id desc), '[]'::jsonb)
  from (select p.id, p.publish_at
        from public.campus_posts p
        where private.campus_switch('campus.posts_enabled')
          and p.institution_id = (select private.my_institution())
          and p.visibility = 'public'
          and private.post_is_live(p.id)
          and (p_after_at is null or p_after_id is null or (p.publish_at, p.id) < (p_after_at, p_after_id))
        order by p.publish_at desc, p.id desc
        limit 30) x;
$$;

create function public.my_saved_posts(p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(x.post_id, (select auth.uid())) || jsonb_build_object('saved_at', x.created_at)
                            order by x.created_at desc, x.post_id desc), '[]'::jsonb)
  from (select s.post_id, s.created_at
        from public.post_saves s
        where s.user_id = (select auth.uid())
          and private.can_read_post(s.post_id)
          and (p_after_at is null or p_after_id is null or (s.created_at, s.post_id) < (p_after_at, p_after_id))
        order by s.created_at desc, s.post_id desc
        limit 30) x;
$$;

-- Verified students of the school get links to full profiles; others see the same
-- short list, linking to public pages ('full' = false).
create function public.organisation_directory(p_query text default null, p_after_name text default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'full', private.caller_verified_at((select private.my_institution())),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'slug', x.slug, 'kind', x.kind, 'logo_path', x.logo_path,
                                          'badge', private.organisation_badge(x.id), 'school_slug', x.school_slug)
                       order by x.name, x.id)
      from (select o.id, o.name, o.slug, o.kind, o.logo_path, i.slug as school_slug
            from public.campus_organisations o join public.institutions i on i.id = o.institution_id
            where private.campus_switch('campus.posts_enabled')
              and (select auth.uid()) is not null
              and o.institution_id = (select private.my_institution())
              and private.organisation_is_live(o.id)
              and (p_query is null or o.name ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%')
              and (p_after_name is null or p_after_id is null or (o.name, o.id) > (p_after_name, p_after_id))
            order by o.name, o.id
            limit 30) x), '[]'::jsonb));
$$;

create function public.organisation_posts(p_organisation_id uuid, p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(x.id, (select auth.uid())) order by x.publish_at desc, x.id desc), '[]'::jsonb)
  from (select p.id, p.publish_at
        from public.campus_posts p
        where p.organisation_id = p_organisation_id
          and p.status = 'published'
          and private.can_read_post(p.id)
          and (p_after_at is null or p_after_id is null or (p.publish_at, p.id) < (p_after_at, p_after_id))
        order by p.publish_at desc, p.id desc
        limit 30) x;
$$;

-- Full profile for verified students of the school (and the organisation's members).
create function public.organisation_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'slug', o.slug, 'kind', o.kind, 'description', o.description, 'logo_path', o.logo_path,
    'contact_email', o.contact_email, 'contact_phone', o.contact_phone, 'badge', private.organisation_badge(o.id),
    'following', exists (select 1 from public.organisation_follows f where f.organisation_id = o.id and f.user_id = (select auth.uid())),
    'my_role', private.organisation_role(o.id),
    'representatives', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.full_name, 'title', m.title, 'role', m.role) order by m.role, p.full_name)
      from public.organisation_members m join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id and m.status = 'active'), '[]'::jsonb),
    'posts', public.organisation_posts(o.id, null, null))
  from public.campus_organisations o
  where o.institution_id = (select private.my_institution())
    and o.slug = lower(btrim(p_slug))
    and private.can_read_organisation(o.id);
$$;

create function public.post_detail(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_post_json(p.id, (select auth.uid()))
         || jsonb_build_object(
              'can_edit', private.can_edit_post(p.id),
              'comments', case when private.campus_switch('campus.comments_enabled') then coalesce((
                select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
                                                    'author', coalesce(pr.first_name, 'Student'),
                                                    'mine', c.author_id = (select auth.uid())) order by c.created_at, c.id)
                from public.post_comments c join public.profiles pr on pr.id = c.author_id
                where c.post_id = p.id and c.status = 'visible'), '[]'::jsonb) else '[]'::jsonb end)
  from public.campus_posts p
  where p.id = p_post_id
    and (private.can_read_post(p.id) or private.can_edit_post(p.id) or private.is_staff('support'));
$$;

-- Public pages (signed-out visitors too). Live, public content of a listed school only;
-- never a person's name.
create function public.public_post(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.campus_public_post_json(p.id)
  from public.campus_posts p
  where p.id = p_post_id
    and private.campus_switch('campus.posts_enabled')
    and p.visibility = 'public'
    and private.post_is_live(p.id);
$$;

create function public.public_organisation(p_school_slug text, p_org_slug text, p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', o.name, 'slug', o.slug, 'kind', o.kind, 'description', o.description, 'logo_path', o.logo_path,
    'contact_email', o.contact_email, 'contact_phone', o.contact_phone, 'badge', private.organisation_badge(o.id),
    'school', i.short_name, 'school_slug', i.slug,
    'posts', coalesce((
      select jsonb_agg(private.campus_public_post_json(x.id) order by x.publish_at desc, x.id desc)
      from (select p.id, p.publish_at from public.campus_posts p
            where p.organisation_id = o.id and p.visibility = 'public' and private.post_is_live(p.id)
              and (p_after_at is null or p_after_id is null or (p.publish_at, p.id) < (p_after_at, p_after_id))
            order by p.publish_at desc, p.id desc limit 30) x), '[]'::jsonb))
  from public.campus_organisations o
  join public.institutions i on i.id = o.institution_id
  where i.slug = lower(btrim(p_school_slug))
    and o.slug = lower(btrim(p_org_slug))
    and private.campus_switch('campus.posts_enabled')
    and private.organisation_is_live(o.id);
$$;

-- Media clean-up (service role only; called by the daily job) ---------------------------

create function public.claim_campus_media_due(p_limit int default 100)
returns setof text
language sql
security definer
set search_path = ''
as $$
  with due as (
    select q.path from public.campus_media_purge q
    where q.purged_at is null and q.attempts < 7 and q.due_at <= now()
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
      -- Never a file something still uses.
      and not exists (select 1 from public.post_media m join public.campus_posts p on p.id = m.post_id
                      where m.path = q.path and p.status <> 'removed')
      and not exists (select 1 from public.campus_organisations o where o.logo_path = q.path and o.status <> 'archived')
    order by q.due_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
    for update skip locked)
  update public.campus_media_purge q set claimed_at = now()
  from due where q.path = due.path
  returning q.path;
$$;

create function public.mark_campus_media_purged(p_paths text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  update public.campus_media_purge set purged_at = now(), claimed_at = null
   where path = any (coalesce(p_paths, '{}')) and purged_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.mark_campus_media_failed(p_path text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.campus_media_purge
     set attempts = attempts + 1, last_error = left(coalesce(p_error, 'unknown'), 300), due_at = now() + interval '1 day', claimed_at = null
   where path = p_path and purged_at is null;
$$;

-- Uploads that nothing uses after 24 hours are queued, then removed a day later.
create function public.queue_campus_media_orphans(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  insert into public.campus_media_purge (path, due_at)
  select s.name, now() + interval '1 day'
  from storage.objects s
  where s.bucket_id = 'campus-media'
    and s.created_at < now() - interval '24 hours'
    and s.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(post|logo)/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and not exists (select 1 from public.post_media m where m.path = s.name)
    and not exists (select 1 from public.campus_organisations o where o.logo_path = s.name)
    and not exists (select 1 from public.campus_media_purge q where q.path = s.name)
  order by s.created_at
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
  on conflict (path) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Removed posts keep their text for 30 days (for appeals), then it is cleared.
create function public.clear_removed_campus_posts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  update public.campus_posts set title = 'Removed post', body = 'Removed.', link_url = null, video_url = null
   where status = 'removed' and removed_at < now() - interval '30 days' and body <> 'Removed.';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Context: the latest definition (0019) plus organisation_roles. ----------------------------
create or replace function public.get_my_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'full_name', p.full_name,
    'first_name', p.first_name,
    'signup_intent', p.signup_intent,
    'is_suspended', p.is_suspended,
    'platform_role', (select s.role from public.platform_staff s where s.user_id = p.id),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1'),
    'institution_roles', coalesce((
      select jsonb_agg(jsonb_build_object('institution_id', r.institution_id, 'short_name', i.short_name, 'role', r.role) order by i.short_name)
      from public.institution_reviewers r
      join public.institutions i on i.id = r.institution_id
      where r.user_id = p.id and r.status = 'active'
    ), '[]'::jsonb),
    'delegated_institutions', coalesce((
      select jsonb_agg(jsonb_build_object('institution_id', i.id, 'short_name', i.short_name) order by i.short_name)
      from public.institutions i
      where exists (select 1 from public.platform_staff s where s.user_id = p.id)
        and (i.review_mode = 'delegated'
             or (select s.role from public.platform_staff s where s.user_id = p.id) in ('admin', 'super_admin'))
    ), '[]'::jsonb),
    'merchant_roles', coalesce((
      select jsonb_agg(jsonb_build_object('merchant_id', m.id, 'display_name', m.display_name, 'role', mu.role, 'status', m.status)
                       order by m.display_name)
      from public.merchant_users mu
      join public.merchants m on m.id = mu.merchant_id
      where mu.user_id = p.id and mu.status = 'active'
    ), '[]'::jsonb),
    'organisation_roles', coalesce((
      select jsonb_agg(jsonb_build_object('organisation_id', o.id, 'name', o.name, 'role', om.role, 'status', o.status)
                       order by o.name)
      from public.organisation_members om
      join public.campus_organisations o on o.id = om.organisation_id
      where om.user_id = p.id and om.status = 'active' and o.status <> 'archived'
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- Grants ---------------------------------------------------------------------------------
-- Default privileges (0001) leave new functions callable by nobody. Grant exactly what is
-- needed; existing grants on other functions are untouched.

-- Default privileges are not relied on: like 0027, every new function is first revoked from
-- everyone, then granted to exactly the roles below.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.proname = any (array['add_comment', 'admin_create_organisation', 'admin_end_campus_agreement', 'admin_find_user_by_email', 'admin_list_organisations', 'admin_record_campus_agreement', 'admin_remove_organisation_member', 'admin_set_campus_switch', 'admin_set_organisation_member', 'admin_set_organisation_status', 'caller_verified_at', 'campus_agreement_active', 'campus_enabled', 'campus_feed', 'campus_highlights', 'campus_media_organisation', 'campus_media_path_ok', 'campus_post_json', 'campus_public_post_json', 'campus_public_school_feed', 'campus_require', 'campus_staff_run', 'campus_switch', 'can_delete_campus_media', 'can_edit_post', 'can_publish', 'can_read_campus_media', 'can_read_organisation', 'can_read_post', 'can_write_campus_media', 'claim_campus_media_due', 'clear_removed_campus_posts', 'follow_organisation', 'guard_campus_organisation', 'guard_campus_post', 'hide_comment', 'mark_campus_media_failed', 'mark_campus_media_purged', 'moderate_report', 'moderation_queue', 'my_organisations', 'my_saved_posts', 'notify_campus', 'organisation_badge', 'organisation_directory', 'organisation_for_editor', 'organisation_is_live', 'organisation_members_for_manager', 'organisation_posts', 'organisation_posts_for_editor', 'organisation_profile', 'organisation_role', 'post_detail', 'post_is_live', 'public_organisation', 'public_post', 'publish_post', 'queue_campus_media', 'queue_campus_media_orphans', 'remove_member', 'remove_organisation_member', 'remove_own_comment', 'report_content', 'require_org_manager', 'save_post', 'set_member', 'set_organisation_member', 'set_post_like', 'set_post_pin', 'set_post_save', 'set_post_status', 'student_verified_at', 'update_organisation'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end;
$$;

-- Helpers that row-level security and Storage policies call (they run as the caller).
grant execute on function private.can_read_organisation(uuid), private.can_read_post(uuid), private.can_edit_post(uuid),
  private.can_write_campus_media(text), private.can_read_campus_media(text), private.can_delete_campus_media(text)
  to authenticated;

-- Signed-out visitors: the switch state and public pages only.
grant execute on function public.campus_enabled(), public.public_post(uuid),
  public.public_organisation(text, text, timestamptz, uuid)
  to anon, authenticated;

-- Signed-in users. Each function checks its own role, school, switch and state.
grant execute on function
  public.admin_record_campus_agreement(uuid, date, date, text, text),
  public.admin_end_campus_agreement(uuid, date),
  public.admin_set_campus_switch(text, boolean),
  public.admin_create_organisation(uuid, text, text, text, uuid, text),
  public.admin_set_organisation_status(uuid, text),
  public.admin_set_organisation_member(uuid, uuid, text, text),
  public.admin_find_user_by_email(text),
  public.admin_remove_organisation_member(uuid, uuid),
  public.admin_list_organisations(uuid),
  public.update_organisation(uuid, text, text, text, text, uuid),
  public.set_organisation_member(uuid, text, text, text),
  public.remove_organisation_member(uuid, uuid),
  public.organisation_members_for_manager(uuid),
  public.organisation_for_editor(uuid),
  public.my_organisations(),
  public.save_post(uuid, uuid, text, text, text, text, text, text, text[]),
  public.publish_post(uuid, timestamptz),
  public.set_post_status(uuid, text),
  public.set_post_pin(uuid, timestamptz),
  public.organisation_posts_for_editor(uuid, timestamptz, uuid),
  public.follow_organisation(uuid, boolean),
  public.set_post_like(uuid, boolean),
  public.set_post_save(uuid, boolean),
  public.add_comment(uuid, text),
  public.remove_own_comment(uuid),
  public.hide_comment(uuid),
  public.report_content(text, uuid, text, text),
  public.moderation_queue(timestamptz, uuid),
  public.moderate_report(uuid, text),
  public.campus_highlights(),
  public.campus_feed(timestamptz, uuid, boolean),
  public.campus_public_school_feed(timestamptz, uuid),
  public.my_saved_posts(timestamptz, uuid),
  public.organisation_directory(text, text, uuid),
  public.organisation_posts(uuid, timestamptz, uuid),
  public.organisation_profile(text),
  public.post_detail(uuid)
  to authenticated;

-- The daily clean-up job (service role) only.
grant execute on function public.claim_campus_media_due(int), public.mark_campus_media_purged(text[]),
  public.mark_campus_media_failed(text, text), public.queue_campus_media_orphans(int), public.clear_removed_campus_posts()
  to service_role;
