-- Google sign-in. Supabase creates the auth user from Google, so the profile
-- trigger gets the name Google gives (full_name) but not whether the person
-- said they're a student or run a business. The callback records that here,
-- once, right after sign-up. It only ever routes the first sign-in.

create function public.set_signup_intent(p_intent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_intent not in ('student', 'merchant') then raise exception 'intent_invalid' using errcode = 'P0001'; end if;
  update public.profiles
     set signup_intent = p_intent
   where id = (select auth.uid())
     and signup_intent is null
     and created_at > now() - interval '30 minutes';
end;
$$;

revoke execute on function public.set_signup_intent(text) from public, anon;
grant execute on function public.set_signup_intent(text) to authenticated;
revoke execute on all functions in schema private from public;
