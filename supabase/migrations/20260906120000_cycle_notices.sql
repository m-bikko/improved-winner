-- Уведомления по циклу: начало менструации, смена фазы, подсказка дня.
--
-- Кому. Владельцу всегда, партнёру - только если владелец открыл доступ.
-- Это то же правило, что и во всём разделе, и здесь оно особенно важно:
-- уведомление уходит на устройство, где его может увидеть кто угодно,
-- и «показывать» тут значит больше, чем на экране в руках.
--
-- Когда. В 13:00 по часовому поясу профиля - один раз в день, одним заходом.
-- Час выбран автором. Проверяется тем же способом, что и напоминания о еде:
-- задание идёт каждый час, а решение принимается по местному времени.
--
-- Почему расчёт продублирован в SQL. Рассылка живёт в базе, а фазы считает
-- клиент. Третьего пути нет: либо считать здесь, либо поднимать серверную
-- функцию ради одного расчёта. Дублирование неприятно, но оно уже есть
-- в проекте для повторения задач, и лечится тем же - сверкой двух
-- реализаций в scripts/check-cycle.ts. Расхождение здесь означало бы,
-- что приложение показывает одну фазу, а уведомление называет другую.

create table public.cycle_notices (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  kind text not null check (kind in ('period', 'phase', 'tip')),
  created_at timestamptz not null default now(),
  primary key (user_id, date, kind)
);

alter table public.cycle_notices enable row level security;
revoke all on public.cycle_notices from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Состояние цикла на дату.
--
-- Зеркало cycleDay() из src/features/cycle/cycle.ts. Держать в согласии
-- обязательно: числа те же, границы фаз те же, овуляция так же считается
-- НАЗАД от следующего начала.

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
  avg_cycle numeric;
  avg_period numeric;
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

  -- Средние по последним шести, и только по правдоподобным значениям.
  -- Границы те же, что в PLAUSIBLE на клиенте: цикл 15-60, менструация 2-12.
  -- Однодневная отметка не должна становиться законом.
  select avg(d) into avg_cycle from (
    select (lead(p.started_on) over (order by p.started_on) - p.started_on) as d
      from public.periods p where p.user_id = owner
  ) x where d between 15 and 60;

  select avg(d) into avg_period from (
    select (p.ended_on - p.started_on + 1) as d
      from public.periods p
     where p.user_id = owner and p.ended_on is not null
  ) y where d between 2 and 12;

  cycle_length := round(coalesce(avg_cycle, 28));
  period_length := round(coalesce(avg_period, 5));
  last_start := last_row.started_on;
  day := on_date - last_row.started_on + 1;
  next_start := last_row.started_on + cycle_length;
  ovulation := next_start - luteal;
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

revoke execute on function public.cycle_state(uuid, date) from public, anon;
grant execute on function public.cycle_state(uuid, date) to authenticated;
