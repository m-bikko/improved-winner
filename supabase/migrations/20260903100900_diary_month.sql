-- Помесячная сводка дневника для календаря.
--
-- Одним запросом вместо выгрузки всех записей месяца и суммирования на клиенте:
-- в календаре нужны только итоги дня, а записей за месяц набирается несколько
-- сотен.
--
-- Функция security invoker (по умолчанию для sql-функций), поэтому RLS
-- применяется как обычно: показать чужой дневник она сможет ровно в тех
-- пределах, в которых это разрешено политикой.
--
-- Норма берётся из снимка дня. Где снимка нет, вернётся null - подставить
-- текущую норму должен клиент, у него она уже есть.

create or replace function public.diary_month(p_user uuid, p_from date, p_to date)
returns table (
  day date,
  kcal numeric,
  protein numeric,
  goal_kcal numeric,
  goal_protein numeric
)
language sql
stable
set search_path = ''
as $$
  select
    e.date as day,
    sum(e.kcal) as kcal,
    sum(e.protein) as protein,
    max(g.kcal) as goal_kcal,
    max(g.protein) as goal_protein
  from public.diary_entries e
  left join public.daily_goals g
    on g.user_id = e.user_id and g.date = e.date
  where e.user_id = p_user
    and e.date between p_from and p_to
  group by e.date
  order by e.date;
$$;

revoke execute on function public.diary_month(uuid, date, date) from public, anon;
grant execute on function public.diary_month(uuid, date, date) to authenticated;
