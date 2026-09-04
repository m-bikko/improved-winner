-- Цикл: даты менструаций и настройки раздела.
--
-- Хранится ТОЛЬКО то, что человек ввёл руками: когда началось и когда
-- закончилось. Длина цикла, длина менструации, фаза, прогноз следующей даты,
-- фертильное окно и предупреждения по нормам — всё это выводится из этих
-- двух дат и нигде не хранится. Причина та же, по которой КБЖУ блюда считает
-- вью, а не триггер: производное состояние, которое можно хранить, однажды
-- разойдётся с источником, и заметить это будет нечем.
--
-- Раздел выключен по умолчанию и виден только владельцу, пока владелец
-- сам не откроет его партнёру. Это единственное место в приложении, где
-- «оба видят всё» не действует, и отступление здесь осознанное: остальные
-- данные — общий быт, а эти — про тело одного человека. Решает тот, чьё тело.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Настройки раздела

create table public.cycle_settings (
  user_id uuid primary key references auth.users on delete cascade,
  -- Раздел вообще показывается? Выключено, пока не включили.
  tracking_enabled boolean not null default false,
  -- Партнёр видит даты и прогноз? Выключено, пока владелец не разрешил.
  share_with_partner boolean not null default false,
  -- Длина лютеиновой фазы для оценки овуляции. У большинства 12-16 дней,
  -- и она устойчивее длины цикла, поэтому овуляция считается назад от конца,
  -- а не вперёд от начала. Настраивается: 14 - это середина, а не закон.
  luteal_days int not null default 14 check (luteal_days between 8 and 20),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Менструации

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_on date not null,
  -- null - идёт прямо сейчас
  ended_on date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint periods_order check (ended_on is null or ended_on >= started_on),
  -- Восемь недель кровотечения - это не «длинная менструация», а ошибка ввода
  -- или повод к врачу; и то и другое хранить как факт нельзя.
  constraint periods_sane_length check (ended_on is null or ended_on - started_on <= 56),
  constraint periods_unique_start unique (user_id, started_on)
);

-- Даты в будущее не проверяются ограничением намеренно.
-- В базе часовой пояс UTC, а «сегодня» у пользователя своё: в час ночи
-- по Алматы current_date в UTC ещё вчерашний, и честная дата начала была бы
-- отвергнута. Дату определяет клиент - то же правило, что и в дневнике.

-- Две менструации не могут идти одновременно.
--
-- Разбито на два ограничения не для красоты: у идущей сейчас нет конца,
-- и втянуть её в диапазон нечем. Поэтому закрытые проверяются пересечением
-- диапазонов, а незакрытая может быть только одна.
alter table public.periods
  add constraint periods_no_overlap
  exclude using gist (
    user_id with =,
    daterange(started_on, ended_on, '[]') with &&
  ) where (ended_on is not null);

create unique index periods_one_ongoing
  on public.periods (user_id)
  where ended_on is null;

create index periods_user_started on public.periods (user_id, started_on desc);

-- ---------------------------------------------------------------------------
-- История с производными длинами
--
-- Вью, а не колонки: длина цикла - это расстояние до СЛЕДУЮЩЕГО начала,
-- то есть свойство пары строк, а не строки. Хранить его в строке значит
-- обновлять прошлое при каждой новой записи.

create view public.periods_v with (security_invoker = on) as
select
  p.id,
  p.user_id,
  p.started_on,
  p.ended_on,
  p.note,
  case when p.ended_on is null then null else p.ended_on - p.started_on + 1 end
    as period_days,
  lead(p.started_on) over (partition by p.user_id order by p.started_on)
    - p.started_on as cycle_days
from public.periods p;

-- ---------------------------------------------------------------------------
-- Права
--
-- profiles и diary_entries читают оба. Здесь не так: читает владелец,
-- а партнёр - только если владелец включил share_with_partner. Пишет
-- всегда только владелец.

alter table public.periods enable row level security;
alter table public.cycle_settings enable row level security;

revoke all on public.periods from anon;
revoke all on public.cycle_settings from anon;
revoke all on public.periods_v from anon;

create or replace function public.cycle_shared_with_me(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cycle_settings s
     where s.user_id = owner
       and s.tracking_enabled
       and s.share_with_partner
  )
$$;

revoke execute on function public.cycle_shared_with_me(uuid) from public, anon;
grant execute on function public.cycle_shared_with_me(uuid) to authenticated;

create policy periods_select on public.periods for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.cycle_shared_with_me(user_id))
  );

create policy periods_insert on public.periods for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

create policy periods_update on public.periods for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy periods_delete on public.periods for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Настройки читает владелец. Партнёру они не нужны: сам факт, что раздел
-- ему открыт, он узнаёт по тому, видит ли он записи.
create policy cycle_settings_select on public.cycle_settings for select to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

create policy cycle_settings_write on public.cycle_settings for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

create policy cycle_settings_update on public.cycle_settings for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
