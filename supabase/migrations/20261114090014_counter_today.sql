-- Counter screen: today's numbers and outcomes at the branches the caller can
-- operate (Africa/Accra day). First names only, as on the live pass.
create function public.counter_today(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
  v_branches uuid[];
begin
  select coalesce(array_agg(b.id), '{}') into v_branches
  from public.merchant_branches b
  where b.merchant_id = p_merchant_id and (select private.can_operate_branch(b.id));
  if cardinality(v_branches) = 0 then raise exception 'forbidden' using errcode = 'P0001'; end if;

  return jsonb_build_object(
    'students', (select count(distinct r.student_id) from public.redemptions r
                 where r.branch_id = any (v_branches) and r.voided_at is null and r.redeemed_at >= v_start),
    'returning', (select count(distinct r.student_id) from public.redemptions r
                  where r.branch_id = any (v_branches) and r.voided_at is null and r.redeemed_at >= v_start
                    and exists (select 1 from public.redemptions e where e.merchant_id = p_merchant_id and e.student_id = r.student_id
                                and e.voided_at is null and e.redeemed_at < v_start)),
    'discount_given', (select coalesce(sum(r.discount_amount), 0) from public.redemptions r
                       where r.branch_id = any (v_branches) and r.voided_at is null and r.redeemed_at >= v_start),
    'recent', coalesce((
      select jsonb_agg(x order by x ->> 'at' desc) from (
        select jsonb_build_object('session_id', s.id, 'first_name', coalesce(p.first_name, split_part(p.full_name, ' ', 1)),
                                  'item', s.item_name, 'outcome', case when s.status = 'completed' then 'confirmed' else 'declined' end,
                                  'reason', s.rejected_reason, 'at', coalesce(s.completed_at, s.ended_at), 'public_ref', s.public_ref) as x
        from public.redemption_sessions s
        join public.profiles p on p.id = s.student_id
        where s.branch_id = any (v_branches) and s.status in ('completed', 'rejected') and coalesce(s.completed_at, s.ended_at) >= v_start
        order by coalesce(s.completed_at, s.ended_at) desc
        limit 30
      ) t), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.counter_today(uuid) from public, anon;
grant execute on function public.counter_today(uuid) to authenticated;

revoke execute on all functions in schema private from public;
