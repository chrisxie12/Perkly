begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Test helpers (rolled back with the transaction) -------------------------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.create_user(p_email text, p_name text default 'Test User')
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), p_email, jsonb_build_object('full_name', p_name))
  returning id;
$$;
create function tests.as_user(p_id uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end;
$$;
create function tests.as_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end;
$$;
create function tests.as_postgres()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
select plan(7);

select id as gctu from public.institutions where slug = 'gctu' \gset
select tests.create_user('admin@perqly.example', 'Platform Admin') as padmin \gset
select tests.create_user('reviewer@perqly.example', 'Perqly Reviewer') as prev \gset
select tests.create_user('support@perqly.example', 'Perqly Support') as psup \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'prev', 'reviewer'), (:'psup', 'support');
select tests.as_postgres();
select is((select review_mode::text from public.institutions where id = :'gctu'), 'institution', 'GCTU reviews its own students (not delegated)');

select tests.as_user(:'padmin', 'aal2');
select ok(private.can_review_institution(:'gctu'), 'a Perqly admin with two-factor can review any institution');
select ok(exists (select 1 from public.my_reviewable_institutions() where institution_id = :'gctu'), 'and sees it in the review queue');
select ok((public.get_my_context() -> 'delegated_institutions') @> jsonb_build_array(jsonb_build_object('institution_id', :'gctu')), 'and gets the Institution area');

select tests.as_user(:'padmin', 'aal1');
select ok(not private.can_review_institution(:'gctu'), 'not without two-factor');

select tests.as_user(:'prev', 'aal2');
select ok(not private.can_review_institution(:'gctu'), 'Perqly reviewers below admin still need the institution to delegate');
select tests.as_user(:'psup', 'aal2');
select ok(not private.can_review_institution(:'gctu'), 'support staff cannot review');

select * from finish();
rollback;
