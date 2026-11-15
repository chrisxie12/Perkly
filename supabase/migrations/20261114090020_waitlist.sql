-- Waitlist: "Get notified when GCTU sign-up opens" on the landing page.
-- Single opt-in. Visitors aren't signed in, so the anon role may call
-- join_waitlist() but never read the table. Staff (support and up, with
-- two-factor) can read it to send the announcement.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique check (char_length(email) between 6 and 254),
  institution_id uuid references public.institutions (id) on delete set null,
  source text not null check (source in ('hero', 'final')),
  created_at timestamptz not null default now()
);
create index waitlist_institution on public.waitlist (institution_id);
alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated, service_role;
grant select on table public.waitlist to authenticated;
create policy "support reads the waitlist" on public.waitlist
  for select to authenticated using ((select private.is_staff('support')));

-- Adds an email. Says nothing about whether it was already there, so the form
-- can't be used to check who signed up. Limits: 3 tries per email per day, and
-- 300 new entries per hour in total, so a script can't flood it.
create function public.join_waitlist(p_email text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_email) not between 6 and 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;
  if p_source not in ('hero', 'final') then raise exception 'source_invalid' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('waitlist.join', 3, interval '1 day', 'waitlist:' || v_email);
  perform private.check_rate_limit('waitlist.join', 300, interval '1 hour', 'waitlist:all');
  insert into public.waitlist (email, institution_id, source)
  values (v_email, (select id from public.institutions where slug = 'gctu'), p_source)
  on conflict (email) do nothing;
end;
$$;

revoke execute on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
revoke execute on all functions in schema private from public;
