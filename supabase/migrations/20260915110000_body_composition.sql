-- Состав тела: то, что даёт биоимпеданс, и ничего сверх того.
--
-- Умные весы возвращают десяток чисел, но измеряют они два: вес и импеданс.
-- Всё остальное - проценты, посчитанные по зашитой в них модели, и килограммы,
-- посчитанные из процентов. Поэтому здесь хранятся ТОЛЬКО проценты и два
-- числа, которых из процентов не получить: индекс висцерального жира
-- и базовый обмен.
--
-- Килограммы жира, мышц, скелетных мышц и воды не хранятся вовсе - они
-- считаются во вью из веса и процента. Причина та же, что у `foods_v`:
-- производное, которое можно хранить, однажды разойдётся с источником,
-- и заметить это будет нечем. Проверено на собственных числах со скриншота:
-- 96.3 кг x 29.0 % = 27.9 кг, ровно то, что показывает сам прибор.
--
-- ВСЕ поля необязательные, и это главное свойство таблицы. Обычные весы дают
-- один вес - этого достаточно, чтобы день считался взвешенным, попал в график
-- и в расчёт расхода. Умные добавляют состав, и тогда открываются расчёты,
-- которых без него не сделать. Ни один экран не имеет права требовать
-- расширенных полей.
--
-- Границы CHECK - это границы ПРАВДОПОДОБИЯ, а не нормы здоровья. Их дело -
-- отвергнуть промах по клавиатуре, а не решить за человека, что с ним. Норма
-- живёт в интерфейсе и говорит осторожно.

alter table public.weight_log
  add column if not exists body_fat_pct numeric(4, 1),
  add column if not exists muscle_pct numeric(4, 1),
  add column if not exists skeletal_muscle_pct numeric(4, 1),
  add column if not exists water_pct numeric(4, 1),
  add column if not exists visceral numeric(4, 1),
  add column if not exists bmr_kcal int;

alter table public.weight_log
  add constraint weight_log_fat_range check (body_fat_pct is null or body_fat_pct between 2 and 75),
  add constraint weight_log_muscle_range check (muscle_pct is null or muscle_pct between 10 and 95),
  add constraint weight_log_skeletal_range
    check (skeletal_muscle_pct is null or skeletal_muscle_pct between 5 and 80),
  add constraint weight_log_water_range check (water_pct is null or water_pct between 20 and 85),
  add constraint weight_log_visceral_range check (visceral is null or visceral between 1 and 60),
  add constraint weight_log_bmr_range check (bmr_kcal is null or bmr_kcal between 500 and 5000);

-- Скелетные мышцы - часть общей мышечной массы, и обратное соотношение
-- означает промах при вводе, а не необычное телосложение.
alter table public.weight_log
  add constraint weight_log_skeletal_within_muscle
    check (
      skeletal_muscle_pct is null or muscle_pct is null
      or skeletal_muscle_pct <= muscle_pct
    );

-- Жир и мышцы вместе не могут занимать больше тела.
alter table public.weight_log
  add constraint weight_log_parts_fit
    check (
      body_fat_pct is null or muscle_pct is null
      or body_fat_pct + muscle_pct <= 100
    );

comment on column public.weight_log.muscle_pct is
  'Общая мышечная масса, % от веса. В приложениях весов - «динамика мышечной массы».';
comment on column public.weight_log.visceral is
  'Индекс висцерального жира. Безразмерный, шкала прибора, а не килограммы.';

-- ---------------------------------------------------------------------------
-- Вью с килограммами.
--
-- security_invoker обязателен: без него вью обошла бы RLS и отдала журнал
-- веса одного участника другому в обход политики.

create or replace view public.weight_log_v with (security_invoker = on) as
select
  l.user_id,
  l.date,
  l.weight_kg,
  l.body_fat_pct,
  l.muscle_pct,
  l.skeletal_muscle_pct,
  l.water_pct,
  l.visceral,
  l.bmr_kcal,
  l.created_at,
  round(l.weight_kg * l.body_fat_pct / 100, 1) as fat_kg,
  -- Тощая масса - всё, что не жир. Именно к ней привязывают норму белка:
  -- жировая ткань в его потреблении не участвует.
  round(l.weight_kg * (100 - l.body_fat_pct) / 100, 1) as lean_kg,
  round(l.weight_kg * l.muscle_pct / 100, 1) as muscle_kg,
  round(l.weight_kg * l.skeletal_muscle_pct / 100, 1) as skeletal_kg,
  round(l.weight_kg * l.water_pct / 100, 1) as water_kg
from public.weight_log l;

revoke all on public.weight_log_v from anon, public;
grant select on public.weight_log_v to authenticated;

-- ---------------------------------------------------------------------------
-- Состав изменения веса.
--
-- Вопрос, ради которого умные весы и покупают: минус три килограмма - это
-- минус три килограмма жира или минус полтора жира и полтора мышц? Обычные
-- весы на него не отвечают в принципе, и человек месяцами не знает, что
-- теряет.
--
-- Считается регрессией по всем точкам, а не разностью «было - стало».
-- Биоимпеданс мерит не жир, а сопротивление тела, и оно сильно зависит
-- от воды: солёный ужин, тренировка накануне, время суток сдвигают процент
-- на пару единиц. На двух точках это даёт «плюс два килограмма мышц за неделю»,
-- чего не бывает. Прямая по десятку точек эту рябь гасит.
--
-- Отсюда и ворота: меньше пяти измерений или короче трёх недель - молчим.
-- Молчание тут честнее числа: неверный ответ на этот вопрос меняет поведение
-- в худшую сторону - человек решает, что теряет мышцы, и бросает дефицит.

create or replace function public.body_composition(
  target uuid,
  today date,
  days int default 56
)
returns table (
  from_date date,
  to_date date,
  window_days int,
  /** Сколько взвешиваний с составом попало в окно. */
  measures int,
  /** Сколько дней между первым и последним из них. */
  span int,
  /** Кг в день. Отрицательный - убывает. */
  weight_slope numeric,
  fat_slope numeric,
  lean_slope numeric,
  /** Изменение за фактический период наблюдения, кг. */
  weight_change numeric,
  fat_change numeric,
  lean_change numeric,
  /** Доля жира в изменении веса, %. null, если вес почти не менялся. */
  fat_share numeric,
  /** Последние известные значения - для показа, а не для тренда. */
  last_date date,
  last_fat_pct numeric,
  last_visceral numeric,
  last_water_pct numeric,
  last_muscle_pct numeric,
  last_skeletal_pct numeric,
  last_bmr int,
  last_lean_kg numeric,
  last_fat_kg numeric,
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
  w record;
  l record;
begin
  from_date := from_d;
  to_date := today;
  window_days := days;

  select count(*)::int as n,
         (max(v.date) - min(v.date))::int as span,
         regr_slope(v.weight_kg, (v.date - from_d)) as w_slope,
         regr_slope(v.fat_kg, (v.date - from_d)) as f_slope,
         regr_slope(v.lean_kg, (v.date - from_d)) as l_slope
    into w
    from public.weight_log_v v
   where v.user_id = target
     and v.date between from_d and today
     and v.body_fat_pct is not null;

  measures := coalesce(w.n, 0);
  span := coalesce(w.span, 0);

  -- Последнее измерение показываем всегда, даже когда тренда нет: одно
  -- взвешивание уже говорит о себе, и прятать его до пятого незачем.
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
