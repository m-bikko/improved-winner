-- Регрессия возвращает double precision, а round с двумя аргументами есть
-- только у numeric - функция падала на первом же вызове с достаточными
-- данными. До ворот дело не доходило: они срабатывали раньше и возвращали
-- null, поэтому «мало данных» работало, а «данных хватает» - нет.
--
-- Поймала это scripts/check-analytics.ts на случае «вес стоит, расход равен
-- съеденному»: до него все проверки шли по ветке отказа.

create or replace function public.energy_balance(
  target uuid,
  today date,
  days int default 28
)
returns table (
  from_date date,
  to_date date,
  window_days int,
  logged_days int,
  mean_kcal numeric,
  weigh_ins int,
  weight_span int,
  first_weight numeric,
  last_weight numeric,
  /** Кг в день. Отрицательный - вес снижается. */
  slope numeric,
  /** Стандартная ошибка наклона, в тех же кг в день. */
  slope_error numeric,
  /** Вес, предсказанный прямой на сегодня: сглаженный, без случайного дня. */
  fit_today numeric,
  /** Расход. null, если данных не хватает. */
  tdee numeric,
  /** Погрешность расхода, ± ккал. */
  tdee_error numeric,
  /** Почему не посчитано: ключ словаря или null. */
  gap text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  from_d date := today - (days - 1);
  d record;
  w record;
  sse numeric;
begin
  from_date := from_d;
  to_date := today;
  window_days := days;

  select count(*)::int as n, avg(t.kcal) as mean
    into d
    from (
      select e.date, sum(e.kcal) as kcal
        from public.diary_entries e
       where e.user_id = target and e.date between from_d and today
       group by e.date
    ) t;

  logged_days := coalesce(d.n, 0);
  mean_kcal := round(coalesce(d.mean, 0), 0);

  select count(*)::int as n,
         (max(l.date) - min(l.date))::int as span,
         regr_slope(l.weight_kg, (l.date - from_d)) as slope,
         regr_intercept(l.weight_kg, (l.date - from_d)) as intercept,
         regr_sxx(l.weight_kg, (l.date - from_d)) as sxx,
         regr_syy(l.weight_kg, (l.date - from_d)) as syy,
         regr_sxy(l.weight_kg, (l.date - from_d)) as sxy,
         min(l.weight_kg) filter (where l.date = (
           select min(l2.date) from public.weight_log l2
            where l2.user_id = target and l2.date between from_d and today)) as first_w,
         min(l.weight_kg) filter (where l.date = (
           select max(l2.date) from public.weight_log l2
            where l2.user_id = target and l2.date between from_d and today)) as last_w
    into w
    from public.weight_log l
   where l.user_id = target and l.date between from_d and today;

  weigh_ins := coalesce(w.n, 0);
  weight_span := coalesce(w.span, 0);
  first_weight := w.first_w;
  last_weight := w.last_w;
  slope := round(coalesce(w.slope, 0)::numeric, 4);

  if w.n >= 3 and w.sxx > 0 then
    -- Остаточная сумма квадратов через суммы произведений: отдельным проходом
    -- по точкам это было бы вторым запросом за теми же строками
    sse := greatest(w.syy - (w.sxy * w.sxy) / w.sxx, 0)::numeric;
    slope_error := round(sqrt((sse / greatest(w.n - 2, 1)) / w.sxx)::numeric, 4);
    fit_today := round((w.intercept + w.slope * (today - from_d))::numeric, 1);
  end if;

  -- Ворота. Порядок важен: сначала то, чего нет совсем, потом то, чего мало
  if logged_days < 14 then
    gap := 'balance.fewDays';
  elsif logged_days::numeric / days < 0.8 then
    gap := 'balance.gaps';
  elsif weigh_ins < 6 or weight_span < 21 then
    gap := 'balance.fewWeights';
  else
    tdee := round(mean_kcal - slope * 7700, 0);
    -- Два стандартных отклонения наклона: грубый девяностопятипроцентный
    -- интервал. Точнее считать незачем - 7700 само по себе приблизительно
    tdee_error := round(2 * coalesce(slope_error, 0) * 7700, 0);
  end if;

  return next;
end;
$$;


revoke execute on function public.energy_balance(uuid, date, int) from public, anon;
grant execute on function public.energy_balance(uuid, date, int) to authenticated;
