-- Chat menu: mute, archive and report.
--
-- Mute and archive are per person (each business team member chooses for themselves).
-- Muting stops a chat's notifications; archiving hides the chat from the list until a
-- new message arrives. Reports go to Perqly support.

create table public.chat_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('shop', 'friend')),
  chat_id uuid not null,
  muted boolean not null default false,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, chat_id)
);
alter table public.chat_prefs enable row level security;
create policy "people read their own chat settings" on public.chat_prefs
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.chat_prefs to authenticated;

create function public.set_chat_pref(p_kind text, p_chat_id uuid, p_muted boolean default null, p_archived boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or p_kind not in ('shop', 'friend') or not private.can_use_chat_topic('chat:' || p_kind || ':' || p_chat_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  insert into public.chat_prefs as cp (user_id, kind, chat_id, muted, archived_at)
  values (v_uid, p_kind, p_chat_id, coalesce(p_muted, false), case when p_archived then now() end)
  on conflict (user_id, kind, chat_id) do update set
    muted = coalesce(p_muted, cp.muted),
    archived_at = case when p_archived is null then cp.archived_at when p_archived then now() else null end,
    updated_at = now();
end;
$$;

-- Muted chats send no notifications. Chat notification links end with the chat's id.
create function private.skip_muted_chat_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_chat uuid;
begin
  if new.kind in ('chat.message', 'friendchat.message') then
    v_chat := (substring(new.link from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))::uuid;
    if v_chat is not null and exists (
      select 1 from public.chat_prefs
      where user_id = new.user_id and chat_id = v_chat and muted
        and kind = case when new.kind = 'friendchat.message' then 'friend' else 'shop' end
    ) then
      return null;
    end if;
  end if;
  return new;
end;
$$;
create trigger notifications_skip_muted_chats before insert on public.notifications
  for each row execute function private.skip_muted_chat_notification();

-- Reports about a chat (spam, rudeness, a scam). Read by Perqly support only.
create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('shop', 'friend')),
  chat_id uuid not null,
  reason text not null check (reason in ('spam', 'rude', 'scam', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null
);
alter table public.chat_reports enable row level security;
create index chat_reports_open on public.chat_reports (created_at desc) where status = 'open';

create function public.report_chat(p_kind text, p_chat_id uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or p_kind not in ('shop', 'friend') or not private.can_use_chat_topic('chat:' || p_kind || ':' || p_chat_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_reason not in ('spam', 'rude', 'scam', 'other') or char_length(coalesce(p_details, '')) > 1000 then
    raise exception 'report_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.report', 5, interval '1 day', v_uid::text);
  insert into public.chat_reports (reporter_id, kind, chat_id, reason, details)
  values (v_uid, p_kind, p_chat_id, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;
  perform private.write_audit('chat.reported', 'self', 'chat_report', v_id, null,
    jsonb_build_object('kind', p_kind, 'chat_id', p_chat_id, 'reason', p_reason));
  return v_id;
end;
$$;

-- For Perqly support: open reports first, with who reported and which business.
create function public.admin_chat_reports()
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
             'id', r.id, 'kind', r.kind, 'chat_id', r.chat_id, 'reason', r.reason, 'details', r.details,
             'status', r.status, 'created_at', r.created_at,
             'reporter', coalesce(p.full_name, 'Deleted account'),
             'business', m.display_name,
             'reporter_side', case when r.kind = 'shop' and c.student_id = r.reporter_id then 'student'
                                   when r.kind = 'shop' then 'business' else 'student' end)
           order by (r.status = 'open') desc, r.created_at desc)
    from (select * from public.chat_reports order by created_at desc limit 200) r
    left join public.profiles p on p.id = r.reporter_id
    left join public.conversations c on r.kind = 'shop' and c.id = r.chat_id
    left join public.merchants m on m.id = c.merchant_id), '[]'::jsonb);
end;
$$;

create function public.admin_close_chat_report(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.chat_reports set status = 'closed', closed_at = now(), closed_by = (select auth.uid())
  where id = p_id and status = 'open';
  perform private.write_audit('chat.report_closed', 'platform:support', 'chat_report', p_id, null, null);
end;
$$;

revoke execute on function public.set_chat_pref(text, uuid, boolean, boolean), public.report_chat(text, uuid, text, text),
  public.admin_chat_reports(), public.admin_close_chat_report(uuid) from public, anon;
grant execute on function public.set_chat_pref(text, uuid, boolean, boolean), public.report_chat(text, uuid, text, text),
  public.admin_chat_reports(), public.admin_close_chat_report(uuid) to authenticated;
revoke execute on function private.skip_muted_chat_notification() from public, anon, authenticated;
