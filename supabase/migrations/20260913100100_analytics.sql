-- Три счётчика поверх уже собранных данных.
--
-- Общее у них одно: они ничего не просят записывать заново. Дневник и журнал
-- веса ведутся с первого дня, а вопросы «сколько я на самом деле трачу»
-- и «меняется ли аппетит по фазам» до сих пор оставались без ответа, хотя
-- ответ лежал в тех же строках.

-- ---------------------------------------------------------------------------
-- Энергетический баланс: расход из фактов, а не из формулы.
--
-- Миффлин - Сан Жеор оценивает расход по росту, весу, возрасту и коэффициенту
-- активности, то есть по анкете. Но если человек три недели записывал еду
-- и взвешивался, его расход МОЖНО ИЗМЕРИТЬ: съеденное минус изменение запаса.
--
--   расход ≈ среднее съеденное - (изменение веса в кг за день) × 7700
--
-- 7700 ккал на килограмм - энергоёмкость жировой ткани. Число приблизительное
-- и именно поэтому окно должно быть длинным: на коротком вес меняет вода
-- и гликоген, а не жир, и оценка уезжает в разы.
--
-- ГЛАВНАЯ ЛОВУШКА - пропущенные дни. День без записей это не день без еды,
-- и делить сумму на длину окна нельзя: получится, что человек ест вдвое
-- меньше, чем ест. Поэтому среднее считается ТОЛЬКО по записанным дням,
-- а их доля проверяется отдельно: при дырах больше пятой части окна оценка
-- отказывается считаться вовсе. Молчание тут честнее числа.
--
-- Наклон веса берётся регрессией, а не «первый минус последний»: одно
-- случайное взвешивание после солёного ужина сдвинуло бы разность на кило.
-- Заодно регрессия даёт стандартную ошибку наклона - из неё считается
-- погрешность расхода, и её видно на экране.

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
  slope := round(coalesce(w.slope, 0), 4);

  if w.n >= 3 and w.sxx > 0 then
    -- Остаточная сумма квадратов через суммы произведений: отдельным проходом
    -- по точкам это было бы вторым запросом за теми же строками
    sse := greatest(w.syy - (w.sxy * w.sxy) / w.sxx, 0);
    slope_error := round(sqrt((sse / greatest(w.n - 2, 1)) / w.sxx), 4);
    fit_today := round(w.intercept + w.slope * (today - from_d), 1);
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

-- ---------------------------------------------------------------------------
-- Дневник в разрезе фаз цикла.
--
-- Подсказки утверждают, что во второй половине цикла тянет на сладкое,
-- а вес выше на кило-два от воды. Это описанные механизмы, но до сих пор
-- приложение их только пересказывало - у него есть и фазы, и дневник,
-- и журнал веса, и оно ни разу не свело их вместе.
--
-- Вес показывается ОТКЛОНЕНИЕМ от среднего по окну, а не абсолютным числом:
-- вопрос не «сколько она весит в лютеиновой фазе», а «отличается ли эта фаза
-- от остальных». Абсолютное число тут ничего не добавляет и лишний раз
-- выносит вес на экран.
--
-- Доступ тот же, что у закономерностей: свой цикл либо открытый партнёром.

create or replace function public.cycle_diary_stats(
  owner uuid,
  today date,
  months int default 6
)
returns table (
  phase text,
  days int,
  mean_kcal numeric,
  mean_protein numeric,
  mean_carbs numeric,
  weigh_ins int,
  /** Отклонение среднего веса фазы от среднего за окно, кг. */
  weight_delta numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  from_d date := today - (months || ' months')::interval;
begin
  if me is null or not public.is_member() then
    raise exception '%', public.tx(me, 'e.noAccess');
  end if;
  if me <> owner and not public.cycle_shared_with_me(owner) then
    raise exception '%', public.tx(me, 'e.noAccess');
  end if;

  return query
  with eaten as (
    select e.date, sum(e.kcal) as kcal, sum(e.protein) as protein, sum(e.carbs) as carbs
      from public.diary_entries e
     where e.user_id = owner and e.date between from_d and today
     group by e.date
  ),
  eaten_phased as (
    select s.phase, t.kcal, t.protein, t.carbs
      from eaten t cross join lateral public.cycle_state(owner, t.date) s
     -- День, оторванный от менструации, к фазе не относится: та же оговорка,
     -- что и в закономерностях
     where s.phase is not null and s.day between 1 and 45
  ),
  weights_phased as (
    select s.phase, l.weight_kg
      from public.weight_log l cross join lateral public.cycle_state(owner, l.date) s
     where l.user_id = owner and l.date between from_d and today
       and s.phase is not null and s.day between 1 and 45
  ),
  overall as (select avg(weight_kg) as mean from weights_phased)
  select p.phase,
         p.n,
         round(p.kcal, 0),
         round(p.protein, 0),
         round(p.carbs, 0),
         coalesce(w.n, 0),
         case when w.n >= 3 then round(w.mean - o.mean, 1) end
    from (
      select ep.phase, count(*)::int as n,
             avg(ep.kcal) as kcal, avg(ep.protein) as protein, avg(ep.carbs) as carbs
        from eaten_phased ep group by ep.phase
    ) p
    left join (
      select wp.phase, count(*)::int as n, avg(wp.weight_kg) as mean
        from weights_phased wp group by wp.phase
    ) w on w.phase = p.phase
    cross join overall o
   -- Три дня на фазу - нижняя граница, при которой среднее вообще о чём-то
   -- говорит. Ниже неё показывать нечего, и молчание честнее
   where p.n >= 3
   order by case p.phase
              when 'menstrual' then 1 when 'follicular' then 2
              when 'ovulation' then 3 else 4 end;
end;
$$;

revoke execute on function public.cycle_diary_stats(uuid, date, int) from public, anon;
grant execute on function public.cycle_diary_stats(uuid, date, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Короткая сводка о себе - то, что показывают врачу.
--
-- Всегда о ВЫЗЫВАЮЩЕМ и ни о ком другом: выписка - документ про себя,
-- и параметр «чью» тут был бы лишней возможностью ошибиться.
--
-- Умышленно короткая. Длинную никто не читает, а врачу нужны несколько
-- чисел и диапазон наблюдения; всё остальное он спросит сам.

create or replace function public.health_summary(today date, days int default 90)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  from_d date := today - (days - 1);
  diary record;
  weight record;
  checkin record;
begin
  if me is null then
    raise exception '%', public.tx(me, 'e.noAccess');
  end if;

  select count(*)::int as n, round(avg(t.kcal), 0) as kcal, round(avg(t.protein), 0) as protein
    into diary
    from (
      select e.date, sum(e.kcal) as kcal, sum(e.protein) as protein
        from public.diary_entries e
       where e.user_id = me and e.date between from_d and today
       group by e.date
    ) t;

  select count(*)::int as n, min(l.weight_kg) as lo, max(l.weight_kg) as hi,
         (array_agg(l.weight_kg order by l.date))[1] as first_w,
         (array_agg(l.weight_kg order by l.date desc))[1] as last_w
    into weight
    from public.weight_log l
   where l.user_id = me and l.date between from_d and today;

  select count(*)::int as n,
         count(*) filter (where 'headache' = any(c.states))::int as headache,
         count(*) filter (where 'stomach' = any(c.states))::int as stomach,
         count(*) filter (where 'exhausted' = any(c.states))::int as exhausted,
         count(*) filter (where 'sick' = any(c.states))::int as sick
    into checkin
    from public.checkins c
   where c.user_id = me and c.date between from_d and today;

  return jsonb_build_object(
    'from', from_d,
    'to', today,
    'days', days,
    'diaryDays', coalesce(diary.n, 0),
    'meanKcal', diary.kcal,
    'meanProtein', diary.protein,
    'weighIns', coalesce(weight.n, 0),
    'weightFrom', weight.first_w,
    'weightTo', weight.last_w,
    'weightLow', weight.lo,
    'weightHigh', weight.hi,
    'checkinDays', coalesce(checkin.n, 0),
    'headache', coalesce(checkin.headache, 0),
    'stomach', coalesce(checkin.stomach, 0),
    'exhausted', coalesce(checkin.exhausted, 0),
    'sick', coalesce(checkin.sick, 0)
  );
end;
$$;

revoke execute on function public.health_summary(date, int) from public, anon;
grant execute on function public.health_summary(date, int) to authenticated;
