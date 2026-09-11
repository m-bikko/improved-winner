-- Исправление предыдущей миграции.
--
-- Я переписал две функции по памяти вместо того, чтобы взять их фактическое
-- определение, и сделал два разных повреждения.
--
-- checkin_cycle_patterns: у настоящей функции сигнатура (owner, today, months)
-- и восемь колонок в результате. Я «заменил» её функцией (owner, since)
-- с выдуманным телом - и создал ВТОРУЮ перегрузку, а оригинал остался как был,
-- вместе со своим русским «Нет доступа». Проверка прошла именно поэтому:
-- приложение зовёт трёхаргументную.
--
-- reorder_wishlists: была security invoker, стала definer. Это не мелочь -
-- definer исполняет UPDATE от владельца функции, и RLS на wishlists перестаёт
-- применяться к вызывающему. is_member() остаётся, но рубеж пропал.
--
-- Здесь обе возвращаются к своим настоящим телам, и меняется РОВНО текст
-- сообщения. Лишняя перегрузка удаляется.

drop function if exists public.checkin_cycle_patterns(uuid, date);

create or replace function public.checkin_cycle_patterns(owner uuid, today date, months integer DEFAULT 6)
 RETURNS TABLE(state text, phase text, hits integer, days_in_phase integer, observed_days integer, rate numeric, other_rate numeric, ratio numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_member() then
    raise exception '%', public.tx(me, 'e.noAccess');
  end if;
  if me <> owner and not public.cycle_shared_with_me(owner) then
    raise exception '%', public.tx(me, 'e.noAccess');
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
$$
;

revoke execute on function public.checkin_cycle_patterns(uuid, date, int) from public, anon;
grant execute on function public.checkin_cycle_patterns(uuid, date, int) to authenticated;

create or replace function public.reorder_wishlists(ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '%', public.tx((select auth.uid()), 'e.noAccess');
  end if;

  update public.wishlists w
     set sort_order = pos.n
    from unnest(ids) with ordinality as pos(id, n)
   where w.id = pos.id;
end;
$$;

revoke execute on function public.reorder_wishlists(uuid[]) from public, anon;
grant execute on function public.reorder_wishlists(uuid[]) to authenticated;
