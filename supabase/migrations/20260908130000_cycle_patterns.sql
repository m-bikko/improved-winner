-- Закономерности: чем «Как ты» пересекается с фазой цикла.
--
-- Оба набора данных собираются с самого начала, но ни разу не встречались.
-- А встретиться им стоит: «голова болит на 24-26 день, третий месяц подряд» -
-- ровно то, что человек про себя сам не замечает, потому что помнит
-- последнюю неделю, а не четвёртый месяц.
--
-- ЧАСТОТА, А НЕ КОЛИЧЕСТВО. Наивный подсчёт «в какой фазе состояние
-- встречалось чаще» всегда назовёт лютеиновую: она просто длиннее остальных
-- вдвое. Поэтому доля отмеченных дней внутри фазы сравнивается с долей
-- за её пределами, и в ответ идёт отношение этих долей.
--
-- ПОРОГИ ГРУБЫЕ И НАМЕРЕННО СТРОГИЕ. Данных у пары мало, и красивая
-- закономерность из двух совпадений - не находка, а шум, который человек
-- примет за факт о своём теле. Нужно минимум три попадания, минимум треть
-- дней фазы и как минимум двукратный перевес.
--
-- ПРИВАТНОСТЬ. Выводы наследуют доступ к самому циклу: он виден партнёру
-- только с разрешения владельца, и связка не имеет права быть щелью,
-- через которую то же самое видно окольным путём.

create or replace function public.checkin_cycle_patterns(
  owner uuid,
  today date,
  months int default 6
)
returns table (
  state text,
  phase text,
  hits int,
  days_in_phase int,
  observed_days int,
  /** Доля дней фазы, где состояние отмечено. */
  rate numeric,
  /** Та же доля за пределами фазы. */
  other_rate numeric,
  /** Во сколько раз чаще. */
  ratio numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_member() then
    raise exception 'Нет доступа';
  end if;
  if me <> owner and not public.cycle_shared_with_me(owner) then
    raise exception 'Нет доступа';
  end if;

  return query
  with days as (
    select c.date, c.states, s.phase
      from public.checkins c
      cross join lateral public.cycle_state(owner, c.date) s
     where c.user_id = owner
       and c.date <= today
       and c.date >= today - (months || ' months')::interval
       -- День, оторванный от менструации, к фазе не относится: если запись
       -- о цикле не заводили полгода, «день 190» ничего не значит
       and s.day between 1 and 45
  ),
  by_phase as (
    select d.phase, count(*)::int as n from days d group by d.phase
  ),
  total as (select count(*)::int as n from days),
  marks as (
    select unnest(d.states) as st, d.phase from days d
  ),
  per_state_phase as (
    select m.st, m.phase, count(*)::int as n from marks m group by m.st, m.phase
  ),
  per_state as (
    select m.st, count(*)::int as n from marks m group by m.st
  )
  select
    p.st,
    p.phase,
    p.n,
    b.n,
    t.n,
    round(p.n::numeric / b.n, 3),
    round(
      case when t.n - b.n > 0 then (s.n - p.n)::numeric / (t.n - b.n) else 0 end, 3),
    round(
      case
        when t.n - b.n = 0 or s.n - p.n = 0 then 99
        else (p.n::numeric / b.n) / ((s.n - p.n)::numeric / (t.n - b.n))
      end, 2)
  from per_state_phase p
  join by_phase b on b.phase = p.phase
  join per_state s on s.st = p.st
  cross join total t
  where p.n >= 3
    and b.n >= 3
    and p.n::numeric / b.n >= 0.3
    and (
      s.n - p.n = 0
      or (p.n::numeric / b.n) >= 2 * ((s.n - p.n)::numeric / nullif(t.n - b.n, 0))
    )
  order by 8 desc, 3 desc;
end;
$$;

revoke execute on function public.checkin_cycle_patterns(uuid, date, int) from public, anon;
grant execute on function public.checkin_cycle_patterns(uuid, date, int) to authenticated;
