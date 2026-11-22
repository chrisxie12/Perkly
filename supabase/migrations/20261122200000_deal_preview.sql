-- A public preview of one live deal, for links shared on WhatsApp and elsewhere.
--
-- Signed-out visitors (and link-preview robots) see only what a poster in the shop window
-- would show: the shop's name, the item, the category, the student price and its times.
-- Nothing about students, branches' exact locations, or the business's contacts.
-- Only live deals of approved businesses; anything else returns no row.

create function public.deal_preview(p_offer_id uuid)
returns table (
  offer_id uuid,
  merchant_name text,
  merchant_slug text,
  item text,
  category text,
  discount_type text,
  discount_value numeric,
  regular_price numeric,
  final_price numeric,
  discount_amount numeric,
  run_days smallint[],
  run_from time,
  run_until time,
  cover_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, m.display_name, m.slug, coalesce(o.title, s.name, p.name), c.name,
         o.discount_type::text, o.discount_value, pr.regular_price, pr.final_price, pr.discount_amount,
         o.run_days, o.run_from, o.run_until,
         (select ph.path from public.merchant_photos ph where ph.merchant_id = m.id order by ph.sort_order, ph.created_at limit 1)
  from public.offers o
  join public.merchants m on m.id = o.merchant_id and m.status = 'approved'
  left join public.merchant_categories c on c.id = m.category_id
  left join public.services s on s.id = o.service_id
  left join public.products p on p.id = o.product_id
  cross join lateral private.price_offer(o.id) pr
  where o.id = p_offer_id
    and (private.offer_is_live(o.id, null)
         or exists (select 1 from public.offer_institutions oi where oi.offer_id = o.id and private.offer_is_live(o.id, oi.institution_id)));
$$;

revoke execute on function public.deal_preview(uuid) from public;
grant execute on function public.deal_preview(uuid) to anon, authenticated;
