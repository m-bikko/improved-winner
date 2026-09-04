-- Отметки по дням: обильность, боль, настроение, симптомы, заметка.
--
-- Отдельная таблица, а не колонки в periods, по двум причинам. Отмечать
-- самочувствие имеет смысл в любой день цикла, а не только в дни менструации.
-- И ключ здесь другой: день, а не менструация, - одна отметка на дату,
-- сколько бы записей о менструациях её ни окружало.
--
-- Набор симптомов закрытый и проверяется базой. Свободный текст в массиве
-- означал бы, что «голова», «Голова» и «головная боль» - три разных симптома,
-- и никакая статистика по ним потом не сложится.

create table public.cycle_days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,

  -- Обильность. Мазня бывает и вне менструации, поэтому поле живёт
  -- на любом дне, а не только внутри записи о менструации.
  flow text check (flow in ('spotting', 'light', 'medium', 'heavy')),

  -- Боль по четырёхступенчатой шкале: нет, слабая, средняя, сильная.
  -- Четыре ступени, а не десять: разницу между «6 из 10» и «7 из 10»
  -- человек не воспроизведёт через месяц, и сравнивать эти числа бессмысленно.
  pain smallint check (pain between 0 and 3),

  mood text check (mood in ('great', 'ok', 'low', 'irritable', 'anxious')),

  symptoms text[] not null default '{}',

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, date),

  -- Закрытый словарь симптомов.
  constraint cycle_days_symptoms_known check (
    symptoms <@ array[
      'cramps', 'headache', 'bloating', 'breast-tenderness', 'acne',
      'back-pain', 'fatigue', 'insomnia', 'nausea', 'cravings'
    ]::text[]
  ),

  -- Пустая отметка - это не «день без симптомов», это мусор: она неотличима
  -- от случайного тапа и засоряет календарь точкой, за которой ничего нет.
  constraint cycle_days_not_empty check (
    flow is not null
    or pain is not null
    or mood is not null
    or cardinality(symptoms) > 0
    or (note is not null and length(btrim(note)) > 0)
  )
);

create index cycle_days_user_date on public.cycle_days (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Права - те же, что у periods: пишет владелец, читает владелец и тот,
-- кому владелец открыл раздел.

alter table public.cycle_days enable row level security;
revoke all on public.cycle_days from anon;

create policy cycle_days_select on public.cycle_days for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.cycle_shared_with_me(user_id))
  );

create policy cycle_days_insert on public.cycle_days for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

create policy cycle_days_update on public.cycle_days for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cycle_days_delete on public.cycle_days for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));
