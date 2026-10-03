-- Малыш после рождения.
--
-- Продолжение режима беременности: «малыш родился» заводит малыша и сам
-- закрывает беременность. Дальше - дневник первых месяцев, который ведут
-- оба: кормления (грудь слева или справа, бутылочка с объёмом), сон,
-- подгузники, рост и вес, прививки и визиты к врачу.
--
-- Идущие кормление и сон - строка без конца: таймер на двух телефонах
-- один и тот же, и закончить его может любой из двоих. Идущее кормление
-- или сон у малыша одно - второй запуск того же значил бы двойной таймер.
--
-- Календаря прививок в приложении нет намеренно: его даёт поликлиника,
-- и выдуманная дата прививки хуже пустой. Прививки и визиты записываются
-- сами, с отметкой «сделано».

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or length(btrim(name)) between 1 and 40),
  sex text check (sex in ('m', 'f')),
  born_on date not null,
  weight_g int check (weight_g between 300 and 7000),
  height_cm numeric(4, 1) check (height_cm between 20 and 70),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.babies is 'Малыш: имя, пол, дата рождения и замеры при рождении.';

create table public.baby_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies on delete cascade,
  kind text not null check (kind in ('feed', 'sleep', 'diaper')),
  started_at timestamptz not null,
  -- Пусто - идёт сейчас (кормление, сон). У подгузника конца нет
  ended_at timestamptz,
  side text check (side in ('left', 'right', 'bottle')),
  amount_ml smallint check (amount_ml between 1 and 500),
  diaper text check (diaper in ('wet', 'dirty', 'mixed')),
  note text check (note is null or length(note) <= 300),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint baby_events_shape check (
    case kind
      when 'diaper' then ended_at is null and diaper is not null and side is null and amount_ml is null
      when 'feed' then diaper is null and side is not null and (amount_ml is null or side = 'bottle')
      else diaper is null and side is null and amount_ml is null
    end
  ),
  constraint baby_events_order check (
    ended_at is null or (ended_at > started_at and ended_at <= started_at + interval '12 hours')
  )
);

create index baby_events_baby on public.baby_events (baby_id, started_at desc);
create unique index baby_events_one_running on public.baby_events (baby_id, kind)
  where ended_at is null and kind <> 'diaper';

create table public.baby_growth (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies on delete cascade,
  date date not null,
  weight_g int check (weight_g between 300 and 30000),
  height_cm numeric(4, 1) check (height_cm between 20 and 130),
  head_cm numeric(4, 1) check (head_cm between 20 and 60),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint baby_growth_something check (weight_g is not null or height_cm is not null or head_cm is not null),
  constraint baby_growth_one_per_day unique (baby_id, date)
);

create table public.baby_checkups (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies on delete cascade,
  date date not null,
  kind text not null check (kind in ('vaccine', 'doctor')),
  title text not null check (length(btrim(title)) between 1 and 120),
  note text check (note is null or length(note) <= 300),
  done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index baby_checkups_baby on public.baby_checkups (baby_id, date);

alter table public.babies enable row level security;
alter table public.baby_events enable row level security;
alter table public.baby_growth enable row level security;
alter table public.baby_checkups enable row level security;
revoke all on public.babies from anon;
revoke all on public.baby_events from anon;
revoke all on public.baby_growth from anon;
revoke all on public.baby_checkups from anon;

-- Малыш общий: всё ведут оба
create policy babies_select on public.babies for select to authenticated using (public.is_member());
create policy babies_insert on public.babies for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy babies_update on public.babies for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy babies_delete on public.babies for delete to authenticated using (public.is_member());

create policy baby_events_select on public.baby_events for select to authenticated using (public.is_member());
create policy baby_events_insert on public.baby_events for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy baby_events_update on public.baby_events for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy baby_events_delete on public.baby_events for delete to authenticated using (public.is_member());

create policy baby_growth_select on public.baby_growth for select to authenticated using (public.is_member());
create policy baby_growth_insert on public.baby_growth for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy baby_growth_update on public.baby_growth for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy baby_growth_delete on public.baby_growth for delete to authenticated using (public.is_member());

create policy baby_checkups_select on public.baby_checkups for select to authenticated using (public.is_member());
create policy baby_checkups_insert on public.baby_checkups for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy baby_checkups_update on public.baby_checkups for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy baby_checkups_delete on public.baby_checkups for delete to authenticated using (public.is_member());

-- События - не раньше рождения: запись «до рождения» - опечатка в дате
create or replace function public.baby_events_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  born date;
begin
  select born_on into born from public.babies where id = new.baby_id;
  if new.started_at < (born - 1)::timestamptz then
    raise exception 'baby_events_guard: событие раньше рождения' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.baby_events_guard() from public, anon, authenticated;

create trigger baby_events_guard before insert or update on public.baby_events
  for each row execute function public.baby_events_guard();

-- Малыш родился - режим беременности закрывается сам. Рождение раньше
-- первого дня последней менструации - не эта беременность (добавили
-- старшего ребёнка), её не трогаем
create or replace function public.tg_on_baby_born()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pregnancy
     set ended_on = new.born_on
   where id and ended_on is null and lmp <= new.born_on;
  return new;
end;
$$;

revoke execute on function public.tg_on_baby_born() from public, anon, authenticated;

create trigger babies_born after insert on public.babies
  for each row execute function public.tg_on_baby_born();
