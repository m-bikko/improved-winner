-- Настройки уведомлений: по видам и по каналам, плюс тихие часы.
--
-- Видов рассылок стало одиннадцать, и выключить нельзя было ни одну.
-- Это опаснее, чем кажется: человек, которого раздражает ОДНО уведомление,
-- перестаёт читать ВСЕ - и вместе с надоевшим пропускает срок задачи.
--
-- Вид передаётся ОБЯЗАТЕЛЬНЫМ аргументом, а не необязательным и не через
-- переменную сессии. Необязательный молча пропускал бы новую рассылку мимо
-- настроек, и обнаружилось бы это жалобой «я же выключил». Обязательный
-- ломает сборку, пока автор новой рассылки не скажет, какого она вида.
-- Ровно тот же выбор, что с отступами у шторки: договорённость, которую надо
-- помнить, рано или поздно забывают.
--
-- Отсутствие строки в настройках означает «включено». Так новый вид работает
-- сразу и не требует засева, а таблица хранит только осознанные отказы.

alter table public.profiles
  add column quiet_from int check (quiet_from between 0 and 23),
  add column quiet_to int check (quiet_to between 0 and 23);

comment on column public.profiles.quiet_from is
  'Начало тихих часов по местному времени. Пусто - тихих часов нет.';

create table public.notification_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'letters', 'wishlist'
  )),
  telegram boolean not null default true,
  push boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon;

-- Свои настройки - только свои. Партнёру незачем ни видеть, ни менять,
-- что мне приходит
create policy notification_settings_select on public.notification_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_settings_write on public.notification_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_settings_update on public.notification_settings
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Тихие часы.
--
-- Уведомление в тихий час НЕ откладывается, а не приходит вовсе. Отложенные
-- вывалились бы кучей в восемь утра - это хуже, чем не получить их совсем,
-- потому что читать пачку из шести сообщений никто не станет. Всё, что
-- в них было, и так лежит в приложении.

create or replace function public.in_quiet_hours(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.quiet_from is null or p.quiet_to is null then false
    -- Вырожденный промежуток «с 22 до 22» - это не сутки тишины, а не заданные
    -- тихие часы: иначе одна опечатка выключала бы уведомления навсегда
    when p.quiet_from = p.quiet_to then false
    when p.quiet_from < p.quiet_to then h >= p.quiet_from and h < p.quiet_to
    -- Через полночь: с 22 до 8
    else h >= p.quiet_from or h < p.quiet_to
  end
  from public.profiles p
  cross join lateral (
    select extract(hour from now() at time zone coalesce(p.timezone, 'Asia/Almaty'))::int
  ) as t(h)
  where p.user_id = target
$$;

revoke execute on function public.in_quiet_hours(uuid) from public, anon;
grant execute on function public.in_quiet_hours(uuid) to authenticated;

create or replace function public.notify_allowed(target uuid, kind text, channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select case channel when 'telegram' then s.telegram else s.push end
              from public.notification_settings s
             where s.user_id = target and s.kind = notify_allowed.kind),
           true)
     -- coalesce вокруг тихих часов обязателен: без профиля функция вернёт
     -- пусто, и всё выражение станет null, то есть «не слать» - тишина
     -- на ровном месте
     and not coalesce(public.in_quiet_hours(target), false)
$$;

revoke execute on function public.notify_allowed(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Отправители теперь спрашивают разрешение

drop function if exists public.tg_notify_self(uuid, text);
drop function if exists public.tg_notify_partner(uuid, text);
drop function if exists public.tg_notify_both(text);
drop function if exists public.push_notify(uuid, text, text, text);

create or replace function public.tg_notify_self(target_id uuid, message text, kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  chat_id text;
begin
  if not public.notify_allowed(target_id, kind, 'telegram') then return; end if;

  select decrypted_secret into token
    from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is null then return; end if;

  select p.telegram_chat_id into chat_id
    from public.profiles p where p.user_id = target_id and p.telegram_chat_id is not null;
  if chat_id is null then return; end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', chat_id, 'text', message,
      'parse_mode', 'HTML', 'disable_web_page_preview', true
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception
  when others then
    raise warning 'Telegram: уведомление не отправлено - %', sqlerrm;
end;
$$;

create or replace function public.tg_notify_partner(author_id uuid, message text, kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  target := public.partner_of(author_id);
  if target is null then return; end if;
  perform public.tg_notify_self(target, message, kind);
end;
$$;

create or replace function public.tg_notify_both(message text, kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
begin
  for person in select user_id from public.app_members
  loop
    perform public.tg_notify_self(person.user_id, message, kind);
  end loop;
end;
$$;

create or replace function public.push_notify(
  target_id uuid,
  title text,
  body text,
  kind text,
  url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint_url text;
  shared_secret text;
begin
  if not public.notify_allowed(target_id, kind, 'push') then return; end if;

  select decrypted_secret into endpoint_url
    from vault.decrypted_secrets where name = 'push_endpoint_url' limit 1;
  select decrypted_secret into shared_secret
    from vault.decrypted_secrets where name = 'push_shared_secret' limit 1;
  if endpoint_url is null or shared_secret is null then return; end if;

  perform net.http_post(
    url := endpoint_url,
    body := jsonb_strip_nulls(jsonb_build_object(
      'userId', target_id, 'title', title, 'body', body, 'url', url
    )),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || shared_secret
    ),
    timeout_milliseconds := 10000
  );
exception
  when others then
    raise warning 'Push: напоминание не отправлено - %', sqlerrm;
end;
$$;

revoke execute on function public.tg_notify_self(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.tg_notify_partner(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.tg_notify_both(text, text) from public, anon, authenticated;
revoke execute on function public.push_notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Все рассылки называют свой вид

create or replace function public.ask_checkins()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  person record;
  local_now timestamp;
  today date;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 11 then
      continue;
    end if;

    if exists (
      select 1 from public.checkin_asks a
       where a.user_id = person.user_id and a.date = today
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.checkins c
       where c.user_id = person.user_id and c.date = today
    ) then
      insert into public.checkin_asks (user_id, date) values (person.user_id, today)
      on conflict do nothing;
      continue;
    end if;

    perform public.tg_notify_self(
      person.user_id,
      '<b>Как ты сегодня?</b>' || E'\n\n'
        || 'Настроение, самочувствие, что угодно. Партнёр увидит.'
    , 'checkin');
    perform public.push_notify(
      person.user_id,
      'Как ты сегодня?',
      'Настроение и самочувствие - партнёр увидит', 'checkin',
      '/checkin'
    );

    insert into public.checkin_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$function$;

create or replace function public.ask_checkins_evening()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  person record;
  local_now timestamp;
  today date;
  streak int;
  tail text;
  missed text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 22 then
      continue;
    end if;

    if exists (
      select 1 from public.checkin_asks a
       where a.user_id = person.user_id and a.date = today and a.kind = 'evening'
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.checkins c
       where c.user_id = person.user_id and c.date = today
    ) then
      insert into public.checkin_asks (user_id, date, kind)
      values (person.user_id, today, 'evening')
      on conflict do nothing;
      continue;
    end if;

    missed := public.by_sex(person.user_id,
      'так и не отметился', 'так и не отметилась', 'сегодня без отметки');

    -- Серию считаем на вчера: сегодня по определению пусто, а якорь «вчера»
    -- как раз и даёт то число, которое сгорит в полночь
    streak := public.checkin_streak(person.user_id, today - 1);

    tail := case
      when streak >= 2 then 'Огонёк на ' || streak || ' '
        || case when streak % 10 = 1 and streak % 100 <> 11 then 'день'
                when streak % 10 between 2 and 4 and streak % 100 not between 12 and 14 then 'дня'
                else 'дней' end
        || ' сгорит в полночь.'
      when streak = 1 then 'Огонёк сгорит в полночь.'
      else 'Отметишься - зажжётся огонёк.'
    end;

    perform public.tg_notify_self(
      person.user_id,
      '<b>День почти кончился</b>' || E'\n\n'
        || 'Ты ' || missed || '. ' || tail
    , 'checkin');
    perform public.push_notify(
      person.user_id,
      'День почти кончился',
      tail, 'checkin',
      '/checkin'
    );

    insert into public.checkin_asks (user_id, date, kind)
    values (person.user_id, today, 'evening')
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$function$;

create or replace function public.deliver_letters()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  person record;
  letter record;
  author text;
  written text;
  head text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    if extract(hour from now() at time zone person.tz)::int <> 9 then
      continue;
    end if;

    for letter in
      select l.id, l.author_id, l.audience, l.body, l.created_at
        from public.letters l
       where l.deliver_on <= (now() at time zone person.tz)::date
         and person.user_id in (select public.letter_recipients(l.id))
         and not exists (
           select 1 from public.letter_deliveries d
            where d.letter_id = l.id and d.user_id = person.user_id
         )
       order by l.deliver_on
       limit 20
    loop
      -- Отметка ДО отправки: упавшая отправка потеряет письмо, зато
      -- не превратит его в ежечасную рассылку одного и того же
      insert into public.letter_deliveries (letter_id, user_id)
      values (letter.id, person.user_id)
      on conflict do nothing;

      select nickname into author from public.profiles where user_id = letter.author_id;
      written := to_char(letter.created_at at time zone person.tz, 'DD.MM.YYYY');

      head := case
        when letter.audience = 'both' then 'Письмо из прошлого'
        else 'Письмо от ' || coalesce(author, 'партнёра')
      end;

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || public.tg_escape(head) || '</b>' || E'\n'
          || '<i>написано ' || written || '</i>' || E'\n\n'
          || public.tg_escape(letter.body), 'letters');
      perform public.push_notify(person.user_id, head, left(letter.body, 120), 'letters', '/dates');

      sent := sent + 1;
    end loop;
  end loop;

  -- Письмо считается доставленным, когда его получили ВСЕ адресаты
  update public.letters l
     set delivered_at = now()
   where l.delivered_at is null
     and not exists (
       select 1 from public.letter_recipients(l.id) r
        where not exists (
          select 1 from public.letter_deliveries d
           where d.letter_id = l.id and d.user_id = r
        )
     );

  return sent;
end;
$function$;

create or replace function public.notify_due_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  task record;
  member record;
  offset_min int;
  message text;
  when_text text;
  next_due timestamptz;
  sent int := 0;
begin
  for task in
    select id, title, due_at, reminders, reminded_offsets, recurrence, recurrence_until,
           excluded_at
      from public.tasks
     where done_at is null
       and due_at is not null
       and array_length(reminders, 1) > 0
       -- Отменённое вхождение молчит: человек его отменил, а не отложил
       and not (due_at = any (coalesce(excluded_at, '{}'::timestamptz[])))
       and exists (
         select 1 from unnest(reminders) as o
          where due_at - (o || ' minutes')::interval <= now()
            and not (o = any (reminded_offsets))
       )
     order by due_at
     limit 100
  loop
    for offset_min in
      select o from unnest(task.reminders) as o
       where task.due_at - (o || ' minutes')::interval <= now()
         and not (o = any (task.reminded_offsets))
       order by o desc
    loop
      -- Отметка ставится до отправки: неотправленное уведомление лучше, чем
      -- приходящее каждые пять минут из-за застрявшей ошибки
      update public.tasks
         set reminded_offsets = array_append(reminded_offsets, offset_min)
       where id = task.id;

      when_text := case
        when offset_min = 0 then 'Срок задачи наступил'
        when offset_min < 60 then 'Через ' || offset_min || ' мин срок задачи'
        when offset_min < 1440 then 'Через ' || (offset_min / 60) || ' ч срок задачи'
        else 'Через ' || (offset_min / 1440) || ' дн срок задачи'
      end;

      message := when_text || E'\n\n' || '<b>' || public.tg_escape(task.title) || '</b>';

      -- Обоим участникам: задача общая, и второй должен знать о сроке,
      -- даже если заводил её не он
      for member in select user_id from public.app_members loop
        perform public.tg_notify_self(member.user_id, message, 'tasks');
        perform public.push_notify(member.user_id, when_text, task.title, 'tasks');
      end loop;

      sent := sent + 1;
    end loop;

    -- Вхождение прошло - сдвигаем повторяющуюся задачу и обнуляем отметки
    if task.recurrence is not null and now() >= task.due_at then
      next_due := public.next_occurrence_allowed(
        task.due_at, task.recurrence, task.excluded_at
      );
      if next_due is not null
         and (task.recurrence_until is null or next_due::date <= task.recurrence_until)
      then
        update public.tasks
           set due_at = next_due, reminded_offsets = '{}'
         where id = task.id;
      else
        -- Повторение кончилось: задача остаётся с последним сроком
        update public.tasks set recurrence = null where id = task.id;
      end if;
    end if;
  end loop;

  return sent;
end;
$function$;

create or replace function public.notify_occasions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  person record;
  item record;
  local_now timestamp;
  today date;
  next_on date;
  days int;
  years int;
  headline text;
  tail text;
  sent int := 0;
begin
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

    for item in select id, title, date, kind, yearly, note from public.occasions
    loop
      next_on := public.occasion_next(item.date, item.yearly, today);
      days := next_on - today;

      if days not in (0, 7) then
        continue;
      end if;

      if exists (
        select 1 from public.occasion_notices n
         where n.occasion_id = item.id and n.user_id = person.user_id
           and n.year = extract(year from next_on)::int and n.lead = days
      ) then
        continue;
      end if;

      years := extract(year from next_on)::int - extract(year from item.date)::int;
      tail := case
        when not item.yearly or years <= 0 then ''
        when item.kind = 'birthday' then E'\n' || 'Исполняется ' || years || ' '
          || case when years % 10 = 1 and years % 100 <> 11 then 'год'
                  when years % 10 between 2 and 4 and years % 100 not between 12 and 14 then 'года'
                  else 'лет' end
        else E'\n' || years || '-я годовщина'
      end;

      headline := case when days = 0 then 'Сегодня' else 'Через неделю' end;

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || headline || ': ' || public.tg_escape(item.title) || '</b>'
          || public.tg_escape(tail)
          || case when days = 7 then E'\n\n' || 'Есть неделя, чтобы успеть с подарком.'
                  else '' end
          || case when item.note is null or btrim(item.note) = '' then ''
                  else E'\n\n' || public.tg_escape(item.note) end
      , 'dates');
      perform public.push_notify(
        person.user_id,
        headline,
        item.title || replace(tail, E'\n', ' · '), 'dates',
        '/dates'
      );

      insert into public.occasion_notices (occasion_id, user_id, year, lead)
      values (item.id, person.user_id, extract(year from next_on)::int, days)
      on conflict do nothing;

      sent := sent + 1;
    end loop;
  end loop;

  return sent;
end;
$function$;

create or replace function public.send_cycle_notices()
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
  title text;
  body_owner text;
  body_partner text;
  sent int := 0;
begin
  for owner in
    select p.user_id, p.nickname, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
      join public.cycle_settings s on s.user_id = p.user_id
     where s.tracking_enabled
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
    nick := coalesce(owner.nickname, 'Партнёр');

    -- 1. Предполагаемое начало менструации
    if today = st.next_start
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'period'
       )
    then
      title := 'Менструация ожидается сегодня';
      body_owner := 'По среднему циклу. Сдвиг на пару дней - обычное дело; когда начнётся, отметьте, и прогноз станет точнее.';
      body_partner := 'У ' || nick || ' по прогнозу начало цикла. Это оценка, а не факт.';

      perform public.tg_notify_self(owner.user_id, '<b>' || title || '</b>' || E'\n\n' || body_owner, 'cycle');
      perform public.push_notify(owner.user_id, title, body_owner, 'cycle');
      if shared and partner_id is not null then
        perform public.tg_notify_self(partner_id, '<b>' || title || '</b>' || E'\n\n' || body_partner, 'cycle');
        perform public.push_notify(partner_id, title, body_partner, 'cycle');
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
      title := case st.phase
        when 'menstrual' then 'Началась менструальная фаза'
        when 'follicular' then 'Началась фолликулярная фаза'
        when 'ovulation' then 'Овуляция'
        else 'Началась лютеиновая фаза'
      end;
      body_owner := 'День ' || st.day || ' цикла из ~' || st.cycle_length || '.';
      body_partner := 'У ' || nick || ': день ' || st.day || ' цикла.';

      perform public.tg_notify_self(owner.user_id, '<b>' || title || '</b>' || E'\n\n' || body_owner, 'cycle');
      perform public.push_notify(owner.user_id, title, body_owner, 'cycle');
      if shared and partner_id is not null then
        perform public.tg_notify_self(partner_id, '<b>' || title || '</b>' || E'\n\n' || body_partner, 'cycle');
        perform public.push_notify(partner_id, title, body_partner, 'cycle');
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
      title := 'День ' || st.day || ' цикла';
      body_owner := public.cycle_tip(st.phase, st.day);

      perform public.tg_notify_self(owner.user_id, '<b>' || title || '</b>' || E'\n\n' || body_owner, 'cycle_tips');
      perform public.push_notify(owner.user_id, title, body_owner, 'cycle_tips');
      -- Подсказка дня партнёру НЕ уходит: она обращена к тому, чьё это тело,
      -- и в чужих руках превращается в указание, что тому делать.
      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'tip') on conflict do nothing;
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$function$;

create or replace function public.send_love_notes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  person record;
  partner_nick text;
  note text;
  today date;
  local_now timestamp;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 18 then
      continue;
    end if;

    if exists (
      select 1 from public.love_notes_sent s
       where s.user_id = person.user_id and s.on_date = today
    ) then
      continue;
    end if;

    select n.message into note from public.love_notes n where n.on_date = today;
    -- Даты кончились - молчим. Слать по кругу значило бы нарушить
    -- то самое условие, ради которого тексты и писались по одному.
    if note is null then
      continue;
    end if;

    select p2.nickname into partner_nick
      from public.profiles p2
      join public.app_members m2 on m2.user_id = p2.user_id
     where p2.user_id <> person.user_id
     limit 1;

    note := replace(note, '{partner}', coalesce(partner_nick, 'Твой партнёр'));

    perform public.tg_notify_self(person.user_id, note, 'love_notes');
    perform public.push_notify(person.user_id, 'Помни', note, 'love_notes');

    insert into public.love_notes_sent (user_id, on_date)
    values (person.user_id, today) on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$function$;

create or replace function public.send_meal_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member record;
  local_now timestamp;
  local_date date;
  local_hour int;
  target_meal text;
  meal_title text;
  label text;
  sent int := 0;
begin
  for member in
    select p.user_id, p.nickname, p.sex, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone member.tz;
    local_date := local_now::date;
    local_hour := extract(hour from local_now)::int;

    target_meal := case local_hour
      when 11 then 'breakfast'
      when 14 then 'lunch'
      when 21 then 'dinner'
      else null
    end;

    if target_meal is null then
      continue;
    end if;

    -- Уже поел — напоминать не о чем
    if exists (
      select 1 from public.diary_entries e
       where e.user_id = member.user_id and e.date = local_date and e.meal = target_meal
    ) then
      continue;
    end if;

    -- Уже напоминали сегодня об этом приёме
    if exists (
      select 1 from public.meal_reminders r
       where r.user_id = member.user_id and r.date = local_date and r.meal = target_meal
    ) then
      continue;
    end if;

    meal_title := case target_meal
      when 'breakfast' then 'Завтрак'
      when 'lunch' then 'Обед'
      else 'Ужин'
    end;

    label := case
      when member.sex = 'female' then
        case target_meal
          when 'breakfast' then 'Позавтракала? Покажи что именно)'
          when 'lunch' then 'Пообедала? Покажи что именно)'
          else 'Поужинала? Покажи что именно)'
        end
      when member.sex = 'male' then
        case target_meal
          when 'breakfast' then 'Позавтракал? Покажи что именно)'
          when 'lunch' then 'Пообедал? Покажи что именно)'
          else 'Поужинал? Покажи что именно)'
        end
      else
        -- Пол не указан: обходимся без рода вовсе
        case target_meal
          when 'breakfast' then 'Завтрак был? Покажи что именно)'
          when 'lunch' then 'Обед был? Покажи что именно)'
          else 'Ужин был? Покажи что именно)'
        end
    end;

    perform public.tg_notify_self(member.user_id, label, 'meals');
    perform public.push_notify(member.user_id, meal_title, label, 'meals');

    insert into public.meal_reminders (user_id, date, meal)
    values (member.user_id, local_date, target_meal)
    on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$function$;

create or replace function public.tg_on_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  author text;
  did text;
  feels text;
  target uuid;
  last_sent timestamptz;
begin
  -- Правка, ничего не изменившая, - не событие
  if tg_op = 'UPDATE'
     and new.states is not distinct from old.states
     and new.note is not distinct from old.note then
    return new;
  end if;

  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;

  select n.notified_at into last_sent
    from public.checkin_notices n
   where n.user_id = new.user_id and n.date = new.date;

  if last_sent is not null and last_sent > now() - interval '30 minutes' then
    return new;
  end if;

  select nickname into author from public.profiles where user_id = new.user_id;
  author := coalesce(author, 'Партнёр');
  did := public.by_sex(new.user_id, 'отметил', 'отметила', 'отметил(а)');
  feels := public.by_sex(new.user_id, 'он себя чувствует', 'она себя чувствует', 'дела');

  perform public.tg_notify_partner(
    new.user_id,
    author || ' ' || did || ', как себя чувствует' || E'\n\n'
      || 'Посмотри в приложении, как ' || feels || '.'
  , 'checkin_partner');
  perform public.push_notify(
    target,
    'Самочувствие',
    author || ' ' || did || ', как себя чувствует - посмотри в приложении', 'checkin_partner',
    '/checkin'
  );

  insert into public.checkin_notices (user_id, date) values (new.user_id, new.date)
  on conflict (user_id, date) do update set notified_at = now();

  return new;
end;
$function$;

create or replace function public.tg_on_comment_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  author text;
  did text;
  wrote text;
  topic_title text;
  target uuid;
begin
  select nickname into author from public.profiles where user_id = new.author_id;
  select title into topic_title from public.topics where id = new.topic_id;
  author := coalesce(author, 'Партнёр');
  topic_title := coalesce(topic_title, 'теме');
  did := public.by_sex(new.author_id, 'ответил', 'ответила', 'ответил(а)');
  wrote := public.by_sex(new.author_id, 'что он написал', 'что она написала', 'что там');

  perform public.tg_notify_partner(
    new.author_id,
    author || ' ' || did || ' в теме «' || public.tg_escape(topic_title) || '»' || E'\n\n'
      || 'Посмотри в приложении, ' || wrote || '.'
  , 'topics');

  target := public.partner_of(new.author_id);
  if target is not null then
    perform public.push_notify(
      target,
      'Ответ в теме',
      author || ' ' || did || ' в «' || topic_title || '» - посмотри в приложении', 'topics',
      '/topics/' || new.topic_id
    );
  end if;

  return new;
end;
$function$;

create or replace function public.tg_on_task_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member record;
  who text;
  message text;
begin
  select nickname into who from public.profiles where user_id = (select auth.uid());

  message := coalesce(who, 'Партнёр') || ' удалил задачу' || E'\n\n'
             || '<b>' || public.tg_escape(old.title) || '</b>';

  for member in select user_id from public.app_members loop
    perform public.tg_notify_self(member.user_id, message, 'tasks');
    perform public.push_notify(member.user_id, 'Задача удалена', old.title, 'tasks');
  end loop;

  return old;
end;
$function$;

create or replace function public.tg_on_task_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member record;
  author text;
  due_line text;
  message text;
begin
  select nickname into author from public.profiles where user_id = new.created_by;

  -- Срок в сообщении в поясе профиля автора, а не в UTC: «до 4 сентября,
  -- 10:00» должно означать то же, что человек видел в форме.
  due_line := case
    when new.due_at is null then ''
    else E'\n' || to_char(
      new.due_at at time zone coalesce(
        (select timezone from public.profiles where user_id = new.created_by),
        'Asia/Almaty'
      ),
      'DD.MM в HH24:MI'
    )
  end;

  message := coalesce(author, 'Партнёр') || ' поставил задачу' || E'\n\n'
             || '<b>' || public.tg_escape(new.title) || '</b>'
             || case when new.notes is null or btrim(new.notes) = '' then ''
                     else E'\n' || public.tg_escape(new.notes) end
             || due_line;

  for member in select user_id from public.app_members loop
    perform public.tg_notify_self(member.user_id, message, 'tasks');
    perform public.push_notify(member.user_id, 'Новая задача', new.title, 'tasks');
  end loop;

  return new;
end;
$function$;

create or replace function public.tg_on_topic_closed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  author text;
  did text;
  target uuid;
begin
  actor := coalesce(new.closed_by, new.created_by);
  select nickname into author from public.profiles where user_id = actor;
  author := coalesce(author, 'Партнёр');
  did := public.by_sex(actor, 'закрыл', 'закрыла', 'закрыл(а)');

  perform public.tg_notify_partner(
    actor,
    author || ' ' || did || ' тему «' || public.tg_escape(new.title) || '»' || E'\n\n'
      || 'Посмотри в приложении, как решили.'
  , 'topics');

  target := public.partner_of(actor);
  if target is not null then
    perform public.push_notify(
      target,
      'Тема закрыта',
      author || ' ' || did || ' «' || new.title || '» - посмотри, как решили', 'topics',
      '/topics/' || new.id
    );
  end if;

  return new;
end;
$function$;

create or replace function public.tg_on_topic_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  who text;
  message text;
  partner_id uuid;
begin
  select nickname into who from public.profiles where user_id = old.created_by;

  message := coalesce(who, 'Партнёр') || ' удалил тему' || E'\n\n'
             || '<b>' || public.tg_escape(old.title) || '</b>';

  perform public.tg_notify_partner(old.created_by, message, 'topics');

  -- push уходит тому же адресату, что и телеграм: партнёру автора
  select m.user_id into partner_id
    from public.app_members m where m.user_id <> old.created_by limit 1;
  if partner_id is not null then
    perform public.push_notify(partner_id, 'Тема удалена', old.title, 'topics');
  end if;

  return old;
end;
$function$;

create or replace function public.tg_on_topic_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  author text;
  did text;
  target uuid;
begin
  select nickname into author from public.profiles where user_id = new.created_by;
  author := coalesce(author, 'Партнёр');
  did := public.by_sex(new.created_by, 'завёл', 'завела', 'открыл(а)');

  perform public.tg_notify_partner(
    new.created_by,
    author || ' ' || did || ' тему' || E'\n\n'
      || '<b>' || public.tg_escape(new.title) || '</b>' || E'\n\n'
      || 'Посмотри в приложении, что там.'
  , 'topics');

  target := public.partner_of(new.created_by);
  if target is not null then
    perform public.push_notify(
      target,
      'Новая тема',
      author || ' ' || did || ' «' || new.title || '» - посмотри в приложении', 'topics',
      '/topics/' || new.id
    );
  end if;

  return new;
end;
$function$;

create or replace function public.tg_on_wishlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  row_data record;
  actor uuid;
  who text;
  did text;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  actor := coalesce((select auth.uid()), row_data.created_by);
  select nickname into who from public.profiles where user_id = actor;
  who := coalesce(who, 'Партнёр');

  if tg_op = 'INSERT' then
    did := public.by_sex(actor, 'завёл', 'завела', 'открыл(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' вишлист' || E'\n\n'
        || '<b>' || public.tg_escape(new.title) || '</b>', 'wishlist');

  elsif tg_op = 'DELETE' then
    did := public.by_sex(actor, 'удалил', 'удалила', 'удалил(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' вишлист «' || public.tg_escape(old.title) || '»', 'wishlist');

  elsif new.title is distinct from old.title then
    did := public.by_sex(actor, 'переименовал', 'переименовала', 'переименовал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' вишлист' || E'\n\n'
        || public.tg_escape(old.title) || ' → <b>' || public.tg_escape(new.title) || '</b>', 'wishlist');

  elsif new.image_path is distinct from old.image_path then
    did := case
      when new.image_path is null then public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)')
      when old.image_path is null then public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)')
      else public.by_sex(actor, 'поменял', 'поменяла', 'поменял(а)')
    end;
    perform public.tg_notify_both(
      who || ' ' || did || ' картинку вишлиста «' || public.tg_escape(new.title) || '»', 'wishlist');
  end if;

  return null;
end;
$function$;

create or replace function public.tg_on_wishlist_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  row_data record;
  actor uuid;
  who text;
  wants text;
  did text;
  list record;
  was timestamptz;
  now_closed timestamptz;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  actor := coalesce((select auth.uid()), row_data.created_by);
  select nickname into who from public.profiles where user_id = actor;
  who := coalesce(who, 'Партнёр');

  select id, title, closed_at into list
    from public.wishlists where id = row_data.wishlist_id;
  if not found then
    return null;
  end if;

  if tg_op = 'INSERT' then
    did := public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)');
    if new.wanted_by is distinct from actor then
      select nickname into wants from public.profiles where user_id = new.wanted_by;
    end if;
    perform public.tg_notify_both(
      who || ' ' || did || ' в «' || public.tg_escape(list.title) || '»' || E'\n\n'
        || '<b>' || public.tg_escape(new.title) || '</b>'
        || case when wants is null then '' else ' — хочет ' || public.tg_escape(wants) end, 'wishlist');

  elsif tg_op = 'DELETE' then
    did := public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' из «' || public.tg_escape(list.title) || '»: '
        || public.tg_escape(old.title), 'wishlist');

  elsif (new.done_at is null) is distinct from (old.done_at is null) then
    did := case when new.done_at is not null
                then public.by_sex(actor, 'приобрёл', 'приобрела', 'отметил(а)')
                else public.by_sex(actor, 'вернул', 'вернула', 'вернул(а)') end;
    perform public.tg_notify_both(
      who || ' ' || did || ' «' || public.tg_escape(new.title) || '»'
        || case when new.done_at is null then ' в «' else ' — «' end
        || public.tg_escape(list.title) || '»', 'wishlist');

  elsif new.title is distinct from old.title then
    did := public.by_sex(actor, 'переименовал', 'переименовала', 'переименовал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' пункт в «' || public.tg_escape(list.title) || '»' || E'\n\n'
        || public.tg_escape(old.title) || ' → <b>' || public.tg_escape(new.title) || '</b>', 'wishlist');
  end if;

  was := list.closed_at;
  now_closed := public.wishlist_closed_value(list.id);

  if (was is null) is distinct from (now_closed is null) then
    update public.wishlists set closed_at = now_closed where id = list.id;
    perform public.tg_notify_both(
      case when now_closed is null
           then 'Вишлист <b>«' || public.tg_escape(list.title) || '»</b> вернулся в «Хотим»'
           else 'Вишлист <b>«' || public.tg_escape(list.title) || '»</b> собран целиком' || E'\n\n'
                || 'Карточка уехала в «Приобретено».' end, 'wishlist');
  elsif was is distinct from now_closed then
    update public.wishlists set closed_at = now_closed where id = list.id;
  end if;

  return null;
end;
$function$;
