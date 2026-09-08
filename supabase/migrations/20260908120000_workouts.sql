-- Тренировки: расход калорий рядом с приходом.
--
-- В дневнике до сих пор была только одна половина картины. «Съел 2300 при
-- норме 2000» и «съел 2300, но два часа в зале» - разные дни, а выглядели
-- одинаково.
--
-- Расход ХРАНИТСЯ, а не считается на лету, и по той же причине, по которой
-- в дневнике лежит снимок КБЖУ: формула зависит от веса, вес меняется,
-- и пересчёт задним числом переписал бы историю ровно там, где её берегут.
-- Тренировка полугодовой давности должна остаться такой, какой была.
--
-- Норму дня расход НЕ трогает. daily_goals заморожена на дату, и подмешивать
-- в неё сожжённое значило бы менять смысл числа, на которое человек смотрит
-- каждый день. Баланс показывается отдельной строкой - её видно, и она
-- ничего не подменяет.

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,

  kind text not null check (kind in (
    'gym', 'run', 'walk', 'bike', 'swim', 'yoga',
    'stretch', 'football', 'tennis', 'dance', 'fight', 'other'
  )),

  minutes int not null check (minutes between 1 and 600),

  -- Снимок расхода на момент записи. Ноль допустим: иногда важно отметить
  -- сам факт, а оценку калорий человек не считает осмысленной
  kcal numeric(6, 1) not null check (kcal >= 0 and kcal <= 5000),

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_user_date on public.workouts (user_id, date desc);

create trigger workouts_touch before update on public.workouts
  for each row execute function public.touch_updated_at();

alter table public.workouts enable row level security;
revoke all on public.workouts from anon;

-- Как в дневнике питания: читают оба, пишет каждый своё
create policy workouts_select on public.workouts
  for select to authenticated using (public.is_member());
create policy workouts_insert on public.workouts
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy workouts_update on public.workouts
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy workouts_delete on public.workouts
  for delete to authenticated using (user_id = (select auth.uid()));
