-- Cover photo (first in the gallery) of each listed business, for deal cards,
-- deal pages and saved shops. Students can't read merchant_photos directly;
-- this returns only the cover of approved businesses, to signed-in people.
create function public.merchant_cover_photos(p_merchant_ids uuid[])
returns table (merchant_id uuid, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (ph.merchant_id) ph.merchant_id, ph.path
  from public.merchant_photos ph
  join public.merchants m on m.id = ph.merchant_id and m.status = 'approved'
  where (select auth.uid()) is not null
    and ph.merchant_id = any ((coalesce(p_merchant_ids, '{}'::uuid[]))[1:200])
  order by ph.merchant_id, ph.sort_order, ph.created_at;
$$;

revoke execute on function public.merchant_cover_photos(uuid[]) from public, anon;
grant execute on function public.merchant_cover_photos(uuid[]) to authenticated;
