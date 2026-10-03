-- Режим беременности.
--
-- Продолжение подготовки к зачатию: когда тест положительный, раздел
-- переключается на срок, неделю и размер малыша, визиты к врачу и подсказки
-- второму на каждую неделю. Позже - счётчик шевелений.
--
-- Режим общий для пары (как план подготовки) - одна строка с ключом-константой.
-- Срок считается от первого дня последней менструации (так считают
-- акушеры), дата родов - плюс 280 дней.
--
-- Пока режим включён, рассылки цикла молчат: «скоро менструация», фазы
-- и тем более «задержка 14 дней» на шестой неделе беременности были бы
-- не просто бесполезны.
--
-- Тексты недель - в словарях приложения; в базе только размер малыша
-- для еженедельного уведомления (n.preg.size.<неделя>, отдельной миграцией).

create table public.pregnancy (
  id boolean primary key default true check (id),
  mother_id uuid not null references auth.users on delete cascade,
  -- Первый день последней менструации
  lmp date not null,
  -- Режим закрыт. Причину не спрашиваем и не храним
  ended_on date,
  started_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint pregnancy_end_after_start check (ended_on is null or ended_on >= lmp)
);

comment on table public.pregnancy is
  'Режим беременности пары. Одна строка; ended_on - режим закрыт.';

create table public.pregnancy_visits (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  note text check (note is null or length(note) <= 500),
  done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index pregnancy_visits_date on public.pregnancy_visits (date);

-- Счёт шевелений: сколько и за сколько минут. Пишется законченная сессия
create table public.kick_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  kicks smallint not null check (kicks between 1 and 200),
  created_at timestamptz not null default now(),
  constraint kick_sessions_order check (ended_at > started_at and ended_at - started_at <= interval '12 hours')
);

alter table public.pregnancy enable row level security;
alter table public.pregnancy_visits enable row level security;
alter table public.kick_sessions enable row level security;
revoke all on public.pregnancy from anon;
revoke all on public.pregnancy_visits from anon;
revoke all on public.kick_sessions from anon;

create policy pregnancy_select on public.pregnancy for select to authenticated using (public.is_member());
create policy pregnancy_insert on public.pregnancy for insert to authenticated
  with check (public.is_member() and started_by = (select auth.uid()));
create policy pregnancy_update on public.pregnancy for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy pregnancy_delete on public.pregnancy for delete to authenticated using (public.is_member());

create policy pregnancy_visits_select on public.pregnancy_visits for select to authenticated using (public.is_member());
create policy pregnancy_visits_insert on public.pregnancy_visits for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy pregnancy_visits_update on public.pregnancy_visits for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy pregnancy_visits_delete on public.pregnancy_visits for delete to authenticated using (public.is_member());

create policy kick_sessions_select on public.kick_sessions for select to authenticated using (public.is_member());
create policy kick_sessions_insert on public.kick_sessions for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy kick_sessions_delete on public.kick_sessions for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Идёт ли беременность у этого человека
create or replace function public.pregnancy_active(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pregnancy g where g.mother_id = owner and g.ended_on is null
  )
$$;

revoke execute on function public.pregnancy_active(uuid) from public, anon;
grant execute on function public.pregnancy_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Рассылки цикла молчат, пока идёт беременность

CREATE OR REPLACE FUNCTION public.cycle_delay(owner uuid, on_date date)
 RETURNS TABLE(days integer, level text, basis text, since_last integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Беременность - не задержка
  if public.pregnancy_active(owner) then
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
$function$;

CREATE OR REPLACE FUNCTION public.send_cycle_notices()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare
  owner record;
  st record;
  st_prev record;
  tz text;
  local_now timestamp;
  today date;
  partner_id uuid;
  shared boolean;
  nick text;
  phase_key text;
  dl record;
  sent int := 0;
begin
  for owner in
    select p.user_id, p.nickname, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
      join public.cycle_settings s on s.user_id = p.user_id
     where s.tracking_enabled
       -- В режиме беременности фазы, «скоро менструация» и задержка теряют
       -- смысл: на шестой неделе пришло бы «задержка 14 дней»
       and not public.pregnancy_active(p.user_id)
  loop
    tz := owner.tz;
    local_now := now() at time zone tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 13 then
      continue;
    end if;

    select * into st from public.cycle_state(owner.user_id, today);
    if st.day is null then
      continue;
    end if;

    select * into st_prev from public.cycle_state(owner.user_id, today - 1);

    shared := public.cycle_shared_with_me(owner.user_id);
    select m.user_id into partner_id
      from public.app_members m where m.user_id <> owner.user_id limit 1;

    -- 1. Предполагаемое начало менструации
    if today = st.next_start
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'period'
       )
    then
      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, 'n.cycle.period.title') || '</b>' || E'\n\n'
          || public.tx(owner.user_id, 'n.cycle.period.owner'), 'cycle');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, 'n.cycle.period.title'),
        public.tx(owner.user_id, 'n.cycle.period.owner'), 'cycle');

      if shared and partner_id is not null then
        nick := coalesce(owner.nickname, public.tx(partner_id, 'n.partner'));
        perform public.tg_notify_self(
          partner_id,
          '<b>' || public.tx(partner_id, 'n.cycle.period.title') || '</b>' || E'\n\n'
            || public.tx(partner_id, 'n.cycle.period.partner', nick), 'cycle');
        perform public.push_notify(
          partner_id,
          public.tx(partner_id, 'n.cycle.period.title'),
          public.tx(partner_id, 'n.cycle.period.partner', nick), 'cycle');
      end if;

      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'period') on conflict do nothing;
      sent := sent + 1;
    end if;

    -- 2. Смена фазы: сегодня первый день новой
    if st_prev.phase is not null and st_prev.phase <> st.phase
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'phase'
       )
    then
      phase_key := 'n.cycle.phase.' || st.phase;

      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, phase_key) || '</b>' || E'\n\n'
          || public.tx(
               owner.user_id, 'n.cycle.phase.owner',
               st.day::text, st.cycle_length::text), 'cycle');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, phase_key),
        public.tx(
          owner.user_id, 'n.cycle.phase.owner', st.day::text, st.cycle_length::text),
        'cycle');

      if shared and partner_id is not null then
        nick := coalesce(owner.nickname, public.tx(partner_id, 'n.partner'));
        perform public.tg_notify_self(
          partner_id,
          '<b>' || public.tx(partner_id, phase_key) || '</b>' || E'\n\n'
            || public.tx(partner_id, 'n.cycle.phase.partner', nick, st.day::text), 'cycle');
        perform public.push_notify(
          partner_id,
          public.tx(partner_id, phase_key),
          public.tx(partner_id, 'n.cycle.phase.partner', nick, st.day::text), 'cycle');
      end if;

      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'phase') on conflict do nothing;
      sent := sent + 1;
    end if;

    -- 3. Подсказка дня
    if not exists (
      select 1 from public.cycle_notices n
       where n.user_id = owner.user_id and n.date = today and n.kind = 'tip'
    ) then
      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, 'n.cycle.tip.title', st.day::text) || '</b>'
          || E'\n\n'
          || public.tx(owner.user_id, public.cycle_tip_key(st.phase, st.day)),
        'cycle_tips');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, 'n.cycle.tip.title', st.day::text),
        public.tx(owner.user_id, public.cycle_tip_key(st.phase, st.day)),
        'cycle_tips');
      -- Подсказка дня партнёру НЕ уходит: она обращена к тому, чьё это тело,
      -- и в чужих руках превращается в указание, что тому делать.
      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'tip') on conflict do nothing;
      sent := sent + 1;
    end if;

    -- 4. Задержка: ровно на третий и седьмой день, и больше никогда.
    --
    -- Ежедневное напоминание о задержке - худшее, что можно придумать:
    -- человек и так о ней помнит, а приложение превращалось бы в того
    -- самого, кто спрашивает «ну что?» каждое утро. Два раза: когда ещё
    -- рано делать выводы, и когда уже имеет смысл тест.
    --
    -- Партнёру не уходит вовсе, даже при открытом доступе. Задержка -
    -- это про решения, которые принимает она, и узнавать о ней он должен
    -- от неё, а не из уведомления.
    select * into dl from public.cycle_delay(owner.user_id, today);
    if dl.days in (3, 7)
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'delay'
       )
    then
      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, 'n.cycle.delay.title') || '</b>' || E'

'
          || public.tx(
               owner.user_id,
               case when dl.days = 3 then 'n.cycle.delay.d3' else 'n.cycle.delay.d7' end),
        'cycle');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, 'n.cycle.delay.title'),
        public.tx(
          owner.user_id,
          case when dl.days = 3 then 'n.cycle.delay.d3' else 'n.cycle.delay.d7' end),
        'cycle');

      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'delay') on conflict do nothing;
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Новая неделя - обоим в 10:00 по месту, в день, когда она начинается

insert into public.texts (key, lang, value) values
  ('n.preg.week', 'ru', 'Неделя %1$s'),
  ('n.preg.week', 'kk', '%1$s-апта'),
  ('n.preg.week', 'en', 'Week %1$s'),
  ('n.preg.weekBody', 'ru', 'Малыш сейчас размером с %1$s. Загляните, что нового на этой неделе.'),
  ('n.preg.weekBody', 'kk', 'Нәресте қазір %1$s сияқты. Осы аптада не жаңалық бар екенін қараңдар.'),
  ('n.preg.weekBody', 'en', 'Your baby is now about the size of %1$s. See what is new this week.')
on conflict (key, lang) do update set value = excluded.value;

create table if not exists public.pregnancy_notices (
  user_id uuid not null references auth.users on delete cascade,
  week smallint not null,
  lmp date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, lmp, week)
);

alter table public.pregnancy_notices enable row level security;
revoke all on public.pregnancy_notices from anon, public;
create policy pregnancy_notices_select on public.pregnancy_notices
  for select to authenticated using (public.is_member());

create or replace function public.send_pregnancy_weeks()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  g record;
  person record;
  local_now timestamp;
  today date;
  days int;
  week int;
  sent int := 0;
begin
  select * into g from public.pregnancy where ended_on is null;
  if not found then
    return 0;
  end if;

  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;
    if extract(hour from local_now)::int <> 10 then
      continue;
    end if;
    days := today - g.lmp;
    -- Только в первый день недели и только в пределах срока
    if days % 7 <> 0 then
      continue;
    end if;
    week := days / 7;
    if week < 4 or week > 42 then
      continue;
    end if;
    if exists (
      select 1 from public.pregnancy_notices n
       where n.user_id = person.user_id and n.lmp = g.lmp and n.week = week
    ) then
      continue;
    end if;
    insert into public.pregnancy_notices (user_id, week, lmp) values (person.user_id, week, g.lmp)
    on conflict do nothing;

    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tg_escape(public.tx(person.user_id, 'n.preg.week', week::text)) || '</b>'
        || E'\n\n' || public.tg_escape(public.tx(person.user_id, 'n.preg.weekBody',
             public.tx(person.user_id, 'n.preg.size.' || least(week, 40)::text))),
      'pregnancy');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.preg.week', week::text),
      public.tx(person.user_id, 'n.preg.weekBody',
        public.tx(person.user_id, 'n.preg.size.' || least(week, 40)::text)),
      'pregnancy',
      '/pregnancy');
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_pregnancy_weeks() from anon, public;

select cron.schedule('pregnancy-weeks', '0 * * * *', 'select public.send_pregnancy_weeks()');
