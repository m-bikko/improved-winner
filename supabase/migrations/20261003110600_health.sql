-- Здоровье и аптечка.
--
-- Карточка на каждого: группа крови, аллергии, хронические состояния,
-- контакт на крайний случай. Лекарства с расписанием и напоминаниями,
-- врачи с телефонами. Видят оба - в этом весь смысл: при беременности,
-- в приёмном покое или в аптеке второй знает, что сказать врачу.
-- Правит каждый своё; врачей - оба (общий семейный врач - обычное дело).
--
-- Это не медицинская карта и не назначения: дозировку пишет сам человек
-- со слов врача, приложение только напоминает.

create table public.health_cards (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  blood_type text check (blood_type in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
  allergies text check (allergies is null or length(allergies) <= 500),
  conditions text check (conditions is null or length(conditions) <= 500),
  emergency text check (emergency is null or length(emergency) <= 200),
  notes text check (notes is null or length(notes) <= 1000),
  updated_at timestamptz not null default now()
);

comment on table public.health_cards is
  'Карточка здоровья: группа крови, аллергии, состояния, контакт на крайний случай. Видят оба.';

-- «HH:MM», по возрастанию и без повторов: иначе напоминание пришло бы дважды
create or replace function public.valid_med_times(times text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(times) <= 6
     and not exists (select 1 from unnest(times) t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     and times = array(select distinct x from unnest(times) x order by x)
$$;

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  dose text check (dose is null or length(btrim(dose)) between 1 and 60),
  -- Время приёма по местному времени человека. Пусто - «по необходимости»,
  -- без напоминаний
  times text[] not null default '{}' check (public.valid_med_times(times)),
  starts_on date not null,
  ends_on date,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  constraint medications_period check (ends_on is null or ends_on >= starts_on)
);

create index medications_user on public.medications (user_id);

-- Приём: лекарство, день, время по расписанию
create table public.med_doses (
  medication_id uuid not null references public.medications on delete cascade,
  day date not null,
  slot text not null check (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  taken_at timestamptz not null default now(),
  primary key (medication_id, day, slot)
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  -- Чей врач. Пусто - общий
  person_id uuid references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  specialty text check (specialty is null or length(btrim(specialty)) between 1 and 60),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{5,20}$'),
  place text check (place is null or length(btrim(place)) between 1 and 120),
  note text check (note is null or length(note) <= 300),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.health_cards enable row level security;
alter table public.medications enable row level security;
alter table public.med_doses enable row level security;
alter table public.doctors enable row level security;
revoke all on public.health_cards from anon;
revoke all on public.medications from anon;
revoke all on public.med_doses from anon;
revoke all on public.doctors from anon;

create policy health_cards_select on public.health_cards for select to authenticated using (public.is_member());
create policy health_cards_insert on public.health_cards for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy health_cards_update on public.health_cards for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy health_cards_delete on public.health_cards for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

create policy medications_select on public.medications for select to authenticated using (public.is_member());
create policy medications_insert on public.medications for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy medications_update on public.medications for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy medications_delete on public.medications for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Приём отмечает тот, чьё лекарство: второй видит, принято ли, но не ставит
-- галочку за другого
create or replace function public.med_is_mine(of_med uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.medications m where m.id = of_med and m.user_id = (select auth.uid()))
$$;

revoke execute on function public.med_is_mine(uuid) from public, anon;
grant execute on function public.med_is_mine(uuid) to authenticated;

create policy med_doses_select on public.med_doses for select to authenticated using (public.is_member());
create policy med_doses_insert on public.med_doses for insert to authenticated
  with check (public.is_member() and public.med_is_mine(medication_id));
create policy med_doses_delete on public.med_doses for delete to authenticated
  using (public.is_member() and public.med_is_mine(medication_id));

-- Приём - только по расписанию лекарства и в его сроки
create or replace function public.med_doses_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  select * into m from public.medications where id = new.medication_id;
  if not (new.slot = any (m.times)) then
    raise exception 'med_doses_guard: такого времени в расписании нет' using errcode = '23514';
  end if;
  if new.day < m.starts_on or (m.ends_on is not null and new.day > m.ends_on) then
    raise exception 'med_doses_guard: день вне срока приёма' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.med_doses_guard() from public, anon, authenticated;

create trigger med_doses_guard before insert on public.med_doses
  for each row execute function public.med_doses_guard();

create policy doctors_select on public.doctors for select to authenticated using (public.is_member());
create policy doctors_insert on public.doctors for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy doctors_update on public.doctors for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy doctors_delete on public.doctors for delete to authenticated using (public.is_member());

create or replace function public.health_cards_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger health_cards_touch before update on public.health_cards
  for each row execute function public.health_cards_touch();

-- ---------------------------------------------------------------------------
-- Напоминания: в назначенное время по поясу человека, если приём ещё
-- не отмечен. Прогон раз в пять минут ловит время в окне 15 минут - на
-- случай пропущенного прогона; отметка напоминания не даёт повторить

insert into public.texts (key, lang, value) values
  ('n.meds.title', 'ru', 'Пора: %1$s'),
  ('n.meds.title', 'kk', 'Уақыты келді: %1$s'),
  ('n.meds.title', 'en', 'Time for %1$s'),
  ('n.meds.body', 'ru', '%1$s по расписанию. Отметьте, когда примете.'),
  ('n.meds.body', 'kk', 'Кесте бойынша %1$s. Қабылдағанда белгілеңіз.'),
  ('n.meds.body', 'en', '%1$s as scheduled. Mark it once taken.')
on conflict (key, lang) do update set value = excluded.value;

create table if not exists public.med_notices (
  medication_id uuid not null references public.medications on delete cascade,
  day date not null,
  slot text not null,
  created_at timestamptz not null default now(),
  primary key (medication_id, day, slot)
);

alter table public.med_notices enable row level security;
revoke all on public.med_notices from anon, public;
create policy med_notices_select on public.med_notices for select to authenticated using (public.is_member());

create or replace function public.send_med_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
  sent int := 0;
begin
  for r in
    select m.id, m.user_id, m.name, coalesce(m.dose, m.name) as what, s.slot,
           (at at time zone coalesce(p.timezone, 'Asia/Almaty'))::date as today
      from public.medications m
      join public.profiles p on p.user_id = m.user_id
      join public.app_members am on am.user_id = m.user_id
      cross join lateral unnest(m.times) as s(slot)
     where (at at time zone coalesce(p.timezone, 'Asia/Almaty'))::time >= s.slot::time
       and (at at time zone coalesce(p.timezone, 'Asia/Almaty'))::time < s.slot::time + interval '15 minutes'
  loop
    if r.today < (select starts_on from public.medications where id = r.id)
       or r.today > coalesce((select ends_on from public.medications where id = r.id), r.today) then
      continue;
    end if;
    if exists (select 1 from public.med_doses d where d.medication_id = r.id and d.day = r.today and d.slot = r.slot)
       or exists (select 1 from public.med_notices n where n.medication_id = r.id and n.day = r.today and n.slot = r.slot) then
      continue;
    end if;
    insert into public.med_notices (medication_id, day, slot) values (r.id, r.today, r.slot) on conflict do nothing;
    perform public.tg_notify_self(
      r.user_id,
      '<b>' || public.tg_escape(public.tx(r.user_id, 'n.meds.title', r.name)) || '</b>'
        || E'\n\n' || public.tg_escape(public.tx(r.user_id, 'n.meds.body', r.what)),
      'meds');
    perform public.push_notify(
      r.user_id, public.tx(r.user_id, 'n.meds.title', r.name), public.tx(r.user_id, 'n.meds.body', r.what), 'meds', '/health');
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_med_reminders(timestamptz) from anon, public, authenticated;

select cron.schedule('med-reminders', '*/5 * * * *', 'select public.send_med_reminders()');
