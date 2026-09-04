-- Снимок дневной нормы.
--
-- Норма считается из веса, а вес меняется - в этом весь смысл приложения.
-- Без снимка вчерашнее кольцо пересчитывалось бы по сегодняшней норме: сбросил
-- вес, норма упала с 2635 до 2400, и день, закрытый на 95%, задним числом
-- становится перебором на 4%.
--
-- Это ровно та же ошибка, от которой защищает снимок КБЖУ в diary_entries,
-- только на уровне дня. Решение то же: заморозить то, что было правдой тогда.
--
-- Хранится и направление цели: одна и та же цифра значит «добрать ещё»
-- при наборе и «осталось» при похудении, и подпись под кольцом обязана
-- соответствовать той цели, которая стояла в тот день.

create table public.daily_goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kcal numeric(7, 2) not null check (kcal > 0),
  protein numeric(7, 2) not null check (protein >= 0),
  fat numeric(7, 2) not null check (fat >= 0),
  carbs numeric(7, 2) not null check (carbs >= 0),
  goal_direction text not null check (goal_direction in ('lose', 'maintain', 'gain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create trigger daily_goals_touch before update on public.daily_goals
  for each row execute function public.touch_updated_at();

alter table public.daily_goals enable row level security;
revoke all on public.daily_goals from anon;

-- Как у дневника: видят оба (нужно для режима сравнения), пишет только владелец
create policy daily_goals_select on public.daily_goals
  for select to authenticated using (public.is_member());
create policy daily_goals_insert on public.daily_goals
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy daily_goals_update on public.daily_goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy daily_goals_delete on public.daily_goals
  for delete to authenticated using (user_id = (select auth.uid()));

-- Backfill для дней, которые уже прожиты до появления этой таблицы.
-- Точной нормы тех дней нет, берём текущую: это единственная доступная
-- информация, и она заведомо ближе к правде, чем норма через полгода.
insert into public.daily_goals (user_id, date, kcal, protein, fat, carbs, goal_direction)
select
  d.user_id,
  d.date,
  round(goal.kcal, 2),
  round(1.8 * p.weight_kg, 2),
  round(0.9 * p.weight_kg, 2),
  round(greatest(0, (goal.kcal - 1.8 * p.weight_kg * 4 - 0.9 * p.weight_kg * 9) / 4), 2),
  p.goal_direction
from (select distinct user_id, date from public.diary_entries) d
join public.profiles p on p.user_id = d.user_id
cross join lateral (
  select
    (10 * p.weight_kg + 6.25 * p.height_cm
       - 5 * (extract(year from current_date) - p.birth_year)
       + case when p.sex = 'male' then 5 else -161 end)
    * case p.activity_level
        when 'sedentary' then 1.2
        when 'light' then 1.375
        when 'moderate' then 1.55
        when 'active' then 1.725
        else 1.9
      end
    * case p.goal_direction
        when 'lose' then 0.85
        when 'gain' then 1.1
        else 1
      end as kcal
) goal
where p.weight_kg is not null
  and p.height_cm is not null
  and p.birth_year is not null
  and p.sex is not null
on conflict (user_id, date) do nothing;
