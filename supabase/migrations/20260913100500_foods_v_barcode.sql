-- Штрихкод в foods_v.
--
-- Приложение читает продукты только через вью - она же считает КБЖУ блюда
-- из состава. Колонка, которой во вью нет, для клиента не существует,
-- и поиск по коду просто не нашёл бы ничего.
--
-- Колонка дописана В КОНЕЦ, а не рядом с остальными полями foods:
-- `create or replace view` умеет только добавлять столбцы справа, а вставка
-- в середину читается им как переименование соседнего и отвергается.
--
-- Тело вью взято фактическим определением. security_invoker обязателен:
-- без него вью обходит RLS.

create or replace view public.foods_v with (security_invoker = on) as
SELECT f.id,
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
        CASE
            WHEN f.kind = 'product'::text THEN f.kcal_100
            ELSE round(COALESCE(a.kcal_sum / NULLIF(COALESCE(f.yield_grams, a.grams_sum), 0::numeric) * 100::numeric, 0::numeric), 2)
        END AS kcal_100,
        CASE
            WHEN f.kind = 'product'::text THEN f.protein_100
            ELSE round(COALESCE(a.protein_sum / NULLIF(COALESCE(f.yield_grams, a.grams_sum), 0::numeric) * 100::numeric, 0::numeric), 2)
        END AS protein_100,
        CASE
            WHEN f.kind = 'product'::text THEN f.fat_100
            ELSE round(COALESCE(a.fat_sum / NULLIF(COALESCE(f.yield_grams, a.grams_sum), 0::numeric) * 100::numeric, 0::numeric), 2)
        END AS fat_100,
        CASE
            WHEN f.kind = 'product'::text THEN f.carbs_100
            ELSE round(COALESCE(a.carbs_sum / NULLIF(COALESCE(f.yield_grams, a.grams_sum), 0::numeric) * 100::numeric, 0::numeric), 2)
        END AS carbs_100,
    COALESCE(a.grams_sum, 0::numeric) AS ingredients_grams,
    COALESCE(a.items_count, 0::bigint)::integer AS ingredients_count,
    f.barcode
   FROM foods f
     LEFT JOIN LATERAL ( SELECT sum(di.grams) AS grams_sum,
            count(*) AS items_count,
            sum(di.grams * p.kcal_100 / 100::numeric) AS kcal_sum,
            sum(di.grams * p.protein_100 / 100::numeric) AS protein_sum,
            sum(di.grams * p.fat_100 / 100::numeric) AS fat_sum,
            sum(di.grams * p.carbs_100 / 100::numeric) AS carbs_sum
           FROM dish_items di
             JOIN foods p ON p.id = di.food_id
          WHERE di.dish_id = f.id) a ON f.kind = 'dish'::text;;
