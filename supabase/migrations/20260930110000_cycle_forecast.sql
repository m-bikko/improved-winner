-- Прогноз цикла: пропущенные менструации, медиана и тест на овуляцию.
--
-- Поводом стал живой случай: отмечены 31 июля и 28 сентября, между ними
-- 59 дней - августовскую менструацию просто не внесли. Приложение взяло
-- 59 за среднюю длину, пообещало следующую через 57 дней и нарисовало
-- фертильное окно на месяц позже настоящего. Для тех, кто планирует ребёнка,
-- это хуже, чем отсутствие прогноза.
--
-- Три правки, и каждая продублирована на клиенте в cycle.ts - check-cycle
-- сверяет обе реализации:
--
-- 1. Цикл 42-70 дней, похожий на два обычных подряд, считается пропуском
--    и в прогноз не идёт, пока владелица не подтвердит, что он был настоящим.
-- 2. Длина цикла - медиана последних шести, а не среднее: один выброс больше
--    не перекашивает всё.
-- 3. Положительный тест на овуляцию в текущем цикле фиксирует овуляцию
--    на следующий день, и следующая менструация считается от неё через
--    лютеиновую фазу. Это единственное место, где лютеиновая фаза даёт
--    точность: она почти постоянна, а меняется у цикла первая половина.

-- ---------------------------------------------------------------------------
-- Данные

-- «Этот длинный цикл был настоящим» - снимает подозрение в пропуске.
-- Ставит только владелица: её цикл, её знание. Право на update у неё уже есть.
alter table public.periods
  add column if not exists long_confirmed boolean not null default false;

create or replace view public.periods_v with (security_invoker = on) as
select
  p.id,
  p.user_id,
  p.started_on,
  p.ended_on,
  p.note,
  case when p.ended_on is null then null else p.ended_on - p.started_on + 1 end
    as period_days,
  lead(p.started_on) over (partition by p.user_id order by p.started_on)
    - p.started_on as cycle_days,
  p.long_confirmed
from public.periods p;

-- Положительный тест на овуляцию (ЛГ). Отрицательные не храним: для прогноза
-- они ничего не дают, а лишняя кнопка - это лишнее решение каждое утро.
alter table public.cycle_days
  add column if not exists lh_positive boolean not null default false;

-- День с одним только тестом - полноценная отметка, а не пустая
alter table public.cycle_days drop constraint if exists cycle_days_not_empty;
alter table public.cycle_days add constraint cycle_days_not_empty check (
  flow is not null
  or pain is not null
  or mood is not null
  or cardinality(symptoms) > 0
  or (note is not null and length(btrim(note)) > 0)
  or lh_positive
);

-- ---------------------------------------------------------------------------
-- Длина цикла для прогноза
--
-- Последние шесть законченных циклов. Пропуск - цикл 42-70 дней без
-- подтверждения, если другие циклы (обычные или подтверждённые длинные)
-- говорят, что он примерно вдвое длиннее обычного, или других нет вовсе.
-- Из оставшихся берутся правдоподобные 15-60, и по ним - медиана.
--
-- Граница «обычного» 41, а не 35: сорокадневный цикл бывает, и считать
-- его половиной пропуска нельзя.

create or replace function public.cycle_usable(owner uuid)
returns table (cycle_len int, cycles_used int)
language sql
stable
security definer
set search_path = ''
as $$
  with starts as (
    select p.started_on,
           p.long_confirmed,
           lead(p.started_on) over (order by p.started_on) - p.started_on as d
      from public.periods p
     where p.user_id = owner
  ),
  recent as (
    select s.started_on, s.long_confirmed, s.d
      from starts s
     where s.d is not null
     order by s.started_on desc
     limit 6
  ),
  flagged as (
    select r.d,
           (not r.long_confirmed and r.d between 42 and 70 and coalesce(
              abs(r.d - 2 * (
                select percentile_cont(0.5) within group (order by o.d)
                  from recent o
                 where o.started_on <> r.started_on
                   and o.d >= 15
                   and (o.d <= 41 or o.long_confirmed)
              )) <= 8,
              true)) as gap
      from recent r
  )
  select round((percentile_cont(0.5) within group (order by f.d))::numeric)::int,
         count(*)::int
    from flagged f
   where not f.gap and f.d between 15 and 60
$$;

revoke execute on function public.cycle_usable(uuid) from anon, public, authenticated;

-- Последний положительный тест в текущем цикле, не позже дня расчёта
create or replace function public.cycle_lh_anchor(owner uuid, since date, on_date date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(c.date)
    from public.cycle_days c
   where c.user_id = owner
     and c.lh_positive
     and c.date > since
     and c.date <= on_date
$$;

revoke execute on function public.cycle_lh_anchor(uuid, date, date) from anon, public, authenticated;

-- ---------------------------------------------------------------------------
-- Фаза и задержка - те же, что на клиенте

create or replace function public.cycle_state(owner uuid, on_date date)
returns table (
  day int,
  phase text,
  cycle_length int,
  period_length int,
  next_start date,
  ovulation date,
  last_start date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  luteal int;
  last_row record;
  usable_len int;
  avg_period numeric;
  lh date;
  ovulation_day int;
  bleeding boolean;
begin
  select coalesce(s.luteal_days, 14) into luteal
    from public.cycle_settings s where s.user_id = owner;
  if luteal is null then luteal := 14; end if;

  -- Последняя из НАЧАВШИХСЯ: запись с датой в будущем не должна давать
  -- нулевой и отрицательный день цикла
  select p.started_on, p.ended_on into last_row
    from public.periods p
   where p.user_id = owner and p.started_on <= on_date
   order by p.started_on desc
   limit 1;
  if not found then
    return;
  end if;

  select u.cycle_len into usable_len from public.cycle_usable(owner) u;

  -- Длина менструации - среднее по последним шести, только правдоподобные
  select avg(y.d) into avg_period from (
    select (p.ended_on - p.started_on + 1) as d
      from public.periods p
     where p.user_id = owner and p.ended_on is not null
     order by p.started_on desc
     limit 6
  ) y where y.d between 2 and 12;

  period_length := round(coalesce(avg_period, 5));
  last_start := last_row.started_on;
  day := on_date - last_row.started_on + 1;

  lh := public.cycle_lh_anchor(owner, last_row.started_on, on_date);
  if lh is not null then
    ovulation := lh + 1;
    next_start := ovulation + luteal;
    cycle_length := next_start - last_row.started_on;
  else
    cycle_length := coalesce(usable_len, 28);
    next_start := last_row.started_on + cycle_length;
    ovulation := next_start - luteal;
  end if;
  ovulation_day := ovulation - last_row.started_on + 1;

  bleeding := case
    when last_row.ended_on is null then on_date >= last_row.started_on
    else on_date between last_row.started_on and last_row.ended_on
  end;

  phase := case
    when bleeding or day <= period_length then 'menstrual'
    when day < ovulation_day - 1 then 'follicular'
    when day <= ovulation_day + 1 then 'ovulation'
    else 'luteal'
  end;

  return next;
end;
$$;

create or replace function public.cycle_delay(owner uuid, on_date date)
returns table(days int, level text, basis text, since_last int)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  last_row record;
  usable_len int;
  luteal int;
  lh date;
  base int;
begin
  select p.started_on, p.ended_on into last_row
    from public.periods p
   where p.user_id = owner and p.started_on <= on_date
   order by p.started_on desc
   limit 1;
  if not found then
    return;
  end if;

  -- Менструация идёт прямо сейчас - задержки нет по определению
  if last_row.ended_on is null then
    return;
  end if;

  select coalesce(s.luteal_days, 14) into luteal
    from public.cycle_settings s where s.user_id = owner;
  if luteal is null then luteal := 14; end if;

  select u.cycle_len into usable_len from public.cycle_usable(owner) u;
  lh := public.cycle_lh_anchor(owner, last_row.started_on, on_date);

  -- Тест на овуляцию точнее любой статистики: задержка считается от него
  if lh is not null then
    basis := 'measured';
    base := (lh + 1 + luteal) - last_row.started_on;
  else
    basis := case when usable_len is null then 'assumed' else 'measured' end;
    base := coalesce(usable_len, 35);
  end if;

  since_last := on_date - last_row.started_on;
  days := since_last - base;

  if since_last >= 90 then
    level := 'absent';
    return next;
    return;
  end if;

  -- Ниже трёх дней молчим совсем
  if days < 3 then
    return;
  end if;

  level := case
    when days >= 15 then 'long'
    when days >= 8 then 'notable'
    else 'slight'
  end;
  return next;
end;
$$;
