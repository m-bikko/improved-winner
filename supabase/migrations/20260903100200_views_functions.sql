-- Вью с итоговым КБЖУ и RPC поиска по темам.

-- ---------------------------------------------------------------------------
-- foods_v — КБЖУ продукта или блюда, приведённое к 100 г
--
-- Вью, а не триггер пересчёта. Триггер пришлось бы вешать на foods UPDATE,
-- чтобы при изменении КБЖУ продукта пересчитать все блюда с ним — и этот триггер,
-- апдейтя foods, вызывал бы сам себя. Плюс постоянный риск рассинхронизации.
-- Вью снимает и рекурсию, и рассинхронизацию, а на тысячах строк стоит доли
-- миллисекунды.
--
-- security_invoker обязателен: иначе вью выполняется с правами владельца
-- и обходит RLS нижележащих таблиц.
-- ---------------------------------------------------------------------------

create view public.foods_v with (security_invoker = on) as
select
  f.id,
  f.kind,
  f.name,
  f.brand,
  f.name_norm,
  f.yield_grams,
  f.archived_at,
  f.created_by,
  f.created_at,
  f.updated_at,

  -- nullif(...,0) закрывает деление на ноль у только что созданного блюда
  -- без ингредиентов: там честные нули, а не ошибка
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

-- ---------------------------------------------------------------------------
-- search_topics — полнотекстовый поиск по темам
--
-- Здесь FTS оправдан: тексты длинные, и русская морфология реально работает —
-- «обсудили» находит тему со словом «обсуждение». Для коротких названий продуктов
-- FTS наоборот проигрывает префиксам, поэтому там поиск живёт на клиенте.
--
-- Сырой ввод в to_tsquery недопустим: одиночная кавычка, &, |, ! или скобка дают
-- синтаксическую ошибку Postgres, а не пустой результат. Поэтому запрос сначала
-- чистится регуляркой до букв, цифр и пробелов, и только потом собирается
-- в префиксный tsquery.
-- ---------------------------------------------------------------------------

create or replace function public.search_topics(q text)
returns setof public.topics
language sql
stable
set search_path = ''
as $$
  with cleaned as (
    select nullif(
      btrim(regexp_replace(
        lower(translate(coalesce(q, ''), 'ёЁ', 'еЕ')),
        '[^[:alnum:][:space:]]+', ' ', 'g'
      )),
      ''
    ) as s
  ),
  built as (
    select
      s,
      case
        when s is null then null
        else to_tsquery(
          'pg_catalog.russian'::regconfig,
          (select string_agg(w || ':*', ' & ')
             from regexp_split_to_table(s, '\s+') as w
            where w <> '')
        )
      end as tsq
    from cleaned
  )
  select t.*
  from public.topics t
  cross join built b
  where b.s is null
     or t.search_tsv @@ b.tsq
     -- запасной путь: подстрока в заголовке ловит то, что стеммер не связал
     -- («творожок» не сводится к «творог»)
     or lower(translate(t.title, 'ёЁ', 'еЕ')) like '%' || b.s || '%'
  order by
    case when b.tsq is null then 0 else ts_rank(t.search_tsv, b.tsq) end desc,
    t.created_at desc
  limit 200;
$$;
