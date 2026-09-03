-- Добавляем image_path во вью foods_v.
--
-- Вью перечисляет колонки явно, поэтому новая колонка в foods сама туда
-- не попадает. Звёздочку не ставим намеренно: КБЖУ у блюда должно считаться,
-- а не браться из таблицы, и явный список это гарантирует.

drop view if exists public.foods_v;

create view public.foods_v with (security_invoker = on) as
select
  f.id,
  f.kind,
  f.name,
  f.brand,
  f.name_norm,
  f.yield_grams,
  f.archived_at,
  f.image_path,
  f.created_by,
  f.created_at,
  f.updated_at,

  case
    when f.kind = 'product' then f.kcal_100
    else round(coalesce(a.kcal_sum / nullif(coalesce(f.yield_grams, a.grams_sum), 0) * 100, 0), 2)
  end as kcal_100,
  case
    when f.kind = 'product' then f.protein_100
    else round(coalesce(a.protein_sum / nullif(coalesce(f.yield_grams, a.grams_sum), 0) * 100, 0), 2)
  end as protein_100,
  case
    when f.kind = 'product' then f.fat_100
    else round(coalesce(a.fat_sum / nullif(coalesce(f.yield_grams, a.grams_sum), 0) * 100, 0), 2)
  end as fat_100,
  case
    when f.kind = 'product' then f.carbs_100
    else round(coalesce(a.carbs_sum / nullif(coalesce(f.yield_grams, a.grams_sum), 0) * 100, 0), 2)
  end as carbs_100,

  coalesce(a.grams_sum, 0) as ingredients_grams,
  coalesce(a.items_count, 0)::int as ingredients_count
from public.foods f
left join lateral (
  select
    sum(di.grams) as grams_sum,
    count(*) as items_count,
    sum(di.grams * p.kcal_100 / 100) as kcal_sum,
    sum(di.grams * p.protein_100 / 100) as protein_sum,
    sum(di.grams * p.fat_100 / 100) as fat_sum,
    sum(di.grams * p.carbs_100 / 100) as carbs_sum
  from public.dish_items di
  join public.foods p on p.id = di.food_id
  where di.dish_id = f.id
) a on f.kind = 'dish';
