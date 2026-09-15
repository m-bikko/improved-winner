-- Поправка: regr_slope возвращает double precision, а round с двумя
-- аргументами есть только у numeric.
--
-- Ровно та же ошибка уже ловилась на измеренном расходе (20260913100200),
-- и поймала её снова проверка, а не глаз: функция создаётся без нареканий
-- и падает только при вызове с данными, которых хватает на регрессию. То есть
-- на пустой базе она выглядит здоровой.
--
-- Миграции - неизменяемый журнал, поэтому не правка, а дописка.

create or replace function public.body_composition(
  target uuid,
  today date,
  days int default 56
)
returns table (
  from_date date,
  to_date date,
  window_days int,
  measures int,
  span int,
  weight_slope numeric,
  fat_slope numeric,
  lean_slope numeric,
  weight_change numeric,
  fat_change numeric,
  lean_change numeric,
  fat_share numeric,
  last_date date,
  last_fat_pct numeric,
  last_visceral numeric,
  last_water_pct numeric,
  last_muscle_pct numeric,
  last_skeletal_pct numeric,
  last_bmr int,
  last_lean_kg numeric,
  last_fat_kg numeric,
  gap text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  from_d date := today - (days - 1);
  w record;
  l record;
begin
  from_date := from_d;
  to_date := today;
  window_days := days;

  select count(*)::int as n,
         (max(v.date) - min(v.date))::int as span,
         regr_slope(v.weight_kg, (v.date - from_d))::numeric as w_slope,
         regr_slope(v.fat_kg, (v.date - from_d))::numeric as f_slope,
         regr_slope(v.lean_kg, (v.date - from_d))::numeric as l_slope
    into w
    from public.weight_log_v v
   where v.user_id = target
     and v.date between from_d and today
     and v.body_fat_pct is not null;

  measures := coalesce(w.n, 0);
  span := coalesce(w.span, 0);

  select v.* into l
    from public.weight_log_v v
   where v.user_id = target
     and v.date <= today
     and (v.body_fat_pct is not null or v.visceral is not null or v.bmr_kcal is not null)
   order by v.date desc
   limit 1;

  last_date := l.date;
  last_fat_pct := l.body_fat_pct;
  last_visceral := l.visceral;
  last_water_pct := l.water_pct;
  last_muscle_pct := l.muscle_pct;
  last_skeletal_pct := l.skeletal_muscle_pct;
  last_bmr := l.bmr_kcal;
  last_lean_kg := l.lean_kg;
  last_fat_kg := l.fat_kg;

  if measures = 0 then
    gap := 'body.none';
    return next;
    return;
  end if;
  if measures < 5 then
    gap := 'body.fewMeasures';
    return next;
    return;
  end if;
  if span < 21 then
    gap := 'body.shortSpan';
    return next;
    return;
  end if;

  weight_slope := round(coalesce(w.w_slope, 0), 4);
  fat_slope := round(coalesce(w.f_slope, 0), 4);
  lean_slope := round(coalesce(w.l_slope, 0), 4);

  weight_change := round(weight_slope * span, 1);
  fat_change := round(fat_slope * span, 1);
  lean_change := round(lean_slope * span, 1);

  -- Доля жира в изменении. При почти неизменном весе она не определена:
  -- делить на ноль нельзя, а «минус 0.1 кг, из них 300 % жира» - это шум,
  -- выданный за вывод.
  if abs(weight_change) >= 0.5 then
    fat_share := round(100 * fat_change / weight_change, 0);
  end if;

  return next;
end;
$$;

revoke execute on function public.body_composition(uuid, date, int) from public, anon;
grant execute on function public.body_composition(uuid, date, int) to authenticated;
