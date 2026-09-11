-- Рассылки переходят на словарь.
--
-- Каждое сообщение раньше собиралось конкатенацией по-русски. Теперь текст
-- берётся из public.texts на языке ПОЛУЧАТЕЛЯ, а род глагола - по полу того,
-- КТО сделал. Это два разных человека, и в tx_sex() они разные аргументы:
-- «Аминош завела тему» по-английски читает Бикош, род тут от неё, язык от него.
--
-- Отсюда же главное изменение формы: там, где одно сообщение уходило обоим
-- (вишлист, задачи), теперь оно собирается внутри цикла по участникам.
-- Один текст на двоих был возможен, только пока язык был один на двоих.
--
-- Экранирование для телеграма осталось на месте и по-прежнему применяется
-- к пользовательским кускам - названиям тем, желаний и задач. Сами шаблоны
-- экранировать нельзя: в них есть <b> и <i>, ради которых всё и затевалось.

-- ---------------------------------------------------------------------------
-- Утренний вопрос «как ты»

create or replace function public.ask_checkins()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
      '<b>' || public.tx(person.user_id, 'n.checkin.ask.title') || '</b>' || E'\n\n'
        || public.tx(person.user_id, 'n.checkin.ask.tgBody'),
      'checkin');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.checkin.ask.title'),
      public.tx(person.user_id, 'n.checkin.ask.pushBody'),
      'checkin',
      '/checkin'
    );

    insert into public.checkin_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Вечернее напоминание про огонёк

create or replace function public.ask_checkins_evening()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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

    -- Сообщение о себе самому себе: и род, и язык - его собственные
    missed := public.tx_sex(person.user_id, person.user_id, 'n.checkin.evening.missed');

    -- Серию считаем на вчера: сегодня по определению пусто, а якорь «вчера»
    -- как раз и даёт то число, которое сгорит в полночь
    streak := public.checkin_streak(person.user_id, today - 1);

    tail := case
      when streak >= 2 then public.tx(
        person.user_id, 'n.checkin.evening.streak',
        streak::text, public.tx_plural(person.user_id, 'n.day', streak))
      when streak = 1 then public.tx(person.user_id, 'n.checkin.evening.streakOne')
      else public.tx(person.user_id, 'n.checkin.evening.streakNone')
    end;

    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tx(person.user_id, 'n.checkin.evening.title') || '</b>' || E'\n\n'
        || public.tx(person.user_id, 'n.checkin.evening.tgBody', missed, tail),
      'checkin');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.checkin.evening.title'),
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
$$;

-- ---------------------------------------------------------------------------
-- Партнёр отметил самочувствие

create or replace function public.tg_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  author := coalesce(author, public.tx(target, 'n.partner'));
  did := public.tx_sex(target, new.user_id, 'n.checkinPartner.did');
  feels := public.tx_sex(target, new.user_id, 'n.checkinPartner.feels');

  perform public.tg_notify_partner(
    new.user_id,
    public.tx(target, 'n.checkinPartner.tg', public.tg_escape(author), did, feels),
    'checkin_partner');
  perform public.push_notify(
    target,
    public.tx(target, 'n.checkinPartner.pushTitle'),
    public.tx(target, 'n.checkinPartner.pushBody', author, did),
    'checkin_partner',
    '/checkin'
  );

  insert into public.checkin_notices (user_id, date) values (new.user_id, new.date)
  on conflict (user_id, date) do update set notified_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Подсказка дня цикла: теперь ключом, а не текстом

create or replace function public.cycle_tip_key(phase text, day int)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'n.cycleTip.' || phase || '.' || ((abs(day) % 4) + 1)::text
$$;

comment on function public.cycle_tip_key(text, int) is
  'Ключ подсказки дня. Сам текст лежит в public.texts на трёх языках.';

-- ---------------------------------------------------------------------------
-- Письма из прошлого

create or replace function public.deliver_letters()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
        when letter.audience = 'both' then public.tx(person.user_id, 'n.letter.fromPast')
        else public.tx(
          person.user_id, 'n.letter.from',
          coalesce(author, public.tx(person.user_id, 'n.letter.partner')))
      end;

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || public.tg_escape(head) || '</b>' || E'\n'
          || '<i>' || public.tg_escape(public.tx(person.user_id, 'n.letter.written', written))
          || '</i>' || E'\n\n'
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
$$;

-- ---------------------------------------------------------------------------
-- Сроки задач

create or replace function public.notify_due_tasks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  task record;
  member record;
  offset_min int;
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

      -- Текст свой у каждого: задача общая, а язык нет
      for member in select user_id from public.app_members loop
        when_text := case
          when offset_min = 0 then public.tx(member.user_id, 'n.task.dueNow')
          when offset_min < 60 then
            public.tx(member.user_id, 'n.task.dueMin', offset_min::text)
          when offset_min < 1440 then
            public.tx(member.user_id, 'n.task.dueHour', (offset_min / 60)::text)
          else public.tx(member.user_id, 'n.task.dueDay', (offset_min / 1440)::text)
        end;

        perform public.tg_notify_self(
          member.user_id,
          when_text || E'\n\n' || '<b>' || public.tg_escape(task.title) || '</b>',
          'tasks');
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
$$;

-- ---------------------------------------------------------------------------
-- Новая и удалённая задача

create or replace function public.tg_on_task_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  author text;
  due_line text;
  head text;
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
      'DD.MM HH24:MI'
    )
  end;

  for member in select user_id from public.app_members loop
    head := public.tx(
      member.user_id, 'n.task.line',
      public.tg_escape(coalesce(author, public.tx(member.user_id, 'n.partner'))),
      public.tx_sex(member.user_id, new.created_by, 'n.task.added'));

    perform public.tg_notify_self(
      member.user_id,
      head || E'\n\n' || '<b>' || public.tg_escape(new.title) || '</b>'
        || case when new.notes is null or btrim(new.notes) = '' then ''
                else E'\n' || public.tg_escape(new.notes) end
        || due_line,
      'tasks');
    perform public.push_notify(
      member.user_id, public.tx(member.user_id, 'n.task.pushNew'), new.title, 'tasks');
  end loop;

  return new;
end;
$$;

create or replace function public.tg_on_task_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  actor uuid := (select auth.uid());
  who text;
begin
  select nickname into who from public.profiles where user_id = actor;

  for member in select user_id from public.app_members loop
    perform public.tg_notify_self(
      member.user_id,
      public.tx(
        member.user_id, 'n.task.line',
        public.tg_escape(coalesce(who, public.tx(member.user_id, 'n.partner'))),
        public.tx_sex(member.user_id, actor, 'n.task.deleted'))
        || E'\n\n' || '<b>' || public.tg_escape(old.title) || '</b>',
      'tasks');
    perform public.push_notify(
      member.user_id, public.tx(member.user_id, 'n.task.pushDeleted'), old.title, 'tasks');
  end loop;

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Важные даты

create or replace function public.notify_occasions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
        when item.kind = 'birthday' then E'\n' || public.tx(
          person.user_id, 'n.occasion.turns',
          years::text, public.tx_plural(person.user_id, 'n.year', years))
        else E'\n' || public.tx(person.user_id, 'n.occasion.anniversary', years::text)
      end;

      headline := public.tx(
        person.user_id,
        case when days = 0 then 'n.occasion.today' else 'n.occasion.inWeek' end);

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || public.tg_escape(
            public.tx(person.user_id, 'n.occasion.head', headline, item.title))
          || '</b>'
          || public.tg_escape(tail)
          || case when days = 7
                  then E'\n\n' || public.tx(person.user_id, 'n.occasion.giftHint')
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
$$;

-- ---------------------------------------------------------------------------
-- Ежедневная записка

create or replace function public.send_love_notes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  note text;
  partner_nick text;
  today date;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    today := (now() at time zone person.tz)::date;

    if extract(hour from now() at time zone person.tz)::int <> 8 then
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

    note := replace(
      note, '{partner}',
      coalesce(partner_nick, public.tx(person.user_id, 'n.loveNote.partner')));

    perform public.tg_notify_self(person.user_id, note, 'love_notes');
    perform public.push_notify(
      person.user_id, public.tx(person.user_id, 'n.loveNote.title'), note, 'love_notes');

    insert into public.love_notes_sent (user_id, on_date)
    values (person.user_id, today) on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Напоминания о еде

create or replace function public.send_meal_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
    select p.user_id, p.nickname, coalesce(p.timezone, 'Asia/Almaty') as tz
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

    -- Уже поел - напоминать не о чем
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

    meal_title := public.tx(member.user_id, 'n.meal.' || target_meal);
    -- Человек пишет сам себе: и род, и язык его собственные
    label := public.tx_sex(member.user_id, member.user_id, 'n.meal.ask.' || target_meal);

    perform public.tg_notify_self(member.user_id, label, 'meals');
    perform public.push_notify(member.user_id, meal_title, label, 'meals');

    insert into public.meal_reminders (user_id, date, meal)
    values (member.user_id, local_date, target_meal)
    on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- «Думаю о тебе»

create or replace function public.send_nudge()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  last_at timestamptz;
  who text;
  target uuid;
begin
  if me is null or not public.is_member() then
    raise exception '%', public.tx(me, 'e.noAccess');
  end if;

  select n.created_at into last_at
    from public.nudges n where n.from_id = me
   order by n.created_at desc limit 1;

  if last_at is not null and last_at > now() - interval '30 minutes' then
    raise exception '%', public.tx(me, 'e.nudgeTooSoon');
  end if;

  insert into public.nudges (from_id) values (me);

  target := public.partner_of(me);
  if target is null then
    return now();
  end if;

  select nickname into who from public.profiles where user_id = me;
  who := coalesce(who, public.tx(target, 'n.partner'));

  -- Текста нет намеренно: сообщение целиком в самом факте
  perform public.tg_notify_self(
    target,
    '<b>' || public.tg_escape(public.tx(target, 'n.nudge.title', who)) || '</b>',
    'nudge');
  perform public.push_notify(
    target,
    public.tx(target, 'n.nudge.title', who),
    public.tx(target, 'n.nudge.body'),
    'nudge',
    '/today');

  return now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Темы

create or replace function public.tg_on_topic_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  target uuid;
begin
  target := public.partner_of(new.created_by);
  if target is null then
    return new;
  end if;

  select nickname into author from public.profiles where user_id = new.created_by;
  author := coalesce(author, public.tx(target, 'n.partner'));

  perform public.tg_notify_partner(
    new.created_by,
    public.tx(
      target, 'n.topic.tgNew',
      public.tg_escape(author),
      public.tx_sex(target, new.created_by, 'n.topic.opened'))
      || E'\n\n' || '<b>' || public.tg_escape(new.title) || '</b>' || E'\n\n'
      || public.tx(target, 'n.topic.tgNewTail'),
    'topics');

  perform public.push_notify(
    target,
    public.tx(target, 'n.topic.pushNewTitle'),
    public.tx(
      target, 'n.topic.pushNewBody',
      author, public.tx_sex(target, new.created_by, 'n.topic.opened'), new.title),
    'topics',
    '/topics/' || new.id
  );

  return new;
end;
$$;

create or replace function public.tg_on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  topic_title text;
  did text;
  wrote text;
  target uuid;
begin
  target := public.partner_of(new.author_id);
  if target is null then
    return new;
  end if;

  select nickname into author from public.profiles where user_id = new.author_id;
  select title into topic_title from public.topics where id = new.topic_id;
  author := coalesce(author, public.tx(target, 'n.partner'));
  topic_title := coalesce(topic_title, public.tx(target, 'n.topic.fallbackTitle'));
  did := public.tx_sex(target, new.author_id, 'n.comment.did');
  wrote := public.tx_sex(target, new.author_id, 'n.comment.wrote');

  perform public.tg_notify_partner(
    new.author_id,
    public.tx(
      target, 'n.comment.tg',
      public.tg_escape(author), did, public.tg_escape(topic_title), wrote),
    'topics');

  perform public.push_notify(
    target,
    public.tx(target, 'n.comment.pushTitle'),
    public.tx(target, 'n.comment.pushBody', author, did, topic_title),
    'topics',
    '/topics/' || new.topic_id
  );

  return new;
end;
$$;

create or replace function public.tg_on_topic_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  author text;
  did text;
  target uuid;
begin
  actor := coalesce(new.closed_by, new.created_by);
  target := public.partner_of(actor);
  if target is null then
    return new;
  end if;

  select nickname into author from public.profiles where user_id = actor;
  author := coalesce(author, public.tx(target, 'n.partner'));
  did := public.tx_sex(target, actor, 'n.topic.closed');

  perform public.tg_notify_partner(
    actor,
    public.tx(
      target, 'n.topic.tgClosed',
      public.tg_escape(author), did, public.tg_escape(new.title)),
    'topics');

  perform public.push_notify(
    target,
    public.tx(target, 'n.topic.pushClosedTitle'),
    public.tx(target, 'n.topic.pushClosedBody', author, did, new.title),
    'topics',
    '/topics/' || new.id
  );

  return new;
end;
$$;

create or replace function public.tg_on_topic_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  target uuid;
begin
  target := public.partner_of(old.created_by);
  if target is null then
    return old;
  end if;

  select nickname into who from public.profiles where user_id = old.created_by;
  who := coalesce(who, public.tx(target, 'n.partner'));

  perform public.tg_notify_partner(
    old.created_by,
    public.tx(
      target, 'n.task.line',
      public.tg_escape(who), public.tx_sex(target, old.created_by, 'n.topic.deleted'))
      || E'\n\n' || '<b>' || public.tg_escape(old.title) || '</b>',
    'topics');

  perform public.push_notify(
    target, public.tx(target, 'n.topic.pushDeletedTitle'), old.title, 'topics');

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Вишлист.
--
-- Единственное место, где сообщение уходило обоим одним текстом через
-- tg_notify_both(). Теперь текст собирается внутри цикла: у двоих могут быть
-- разные языки, и одно сообщение на двоих больше не существует.

create or replace function public.tg_on_wishlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data record;
  actor uuid;
  member record;
  who text;
  verb text;
  message text;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  actor := coalesce((select auth.uid()), row_data.created_by);
  select nickname into who from public.profiles where user_id = actor;

  -- Перестановка порядка меняет только sort_order и сюда не доходит:
  -- сообщать «подвинул карточку» было бы шумом
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.image_path is not distinct from old.image_path
     and new.details is not distinct from old.details
     and new.category is not distinct from old.category then
    return null;
  end if;

  for member in select user_id from public.app_members loop
    if tg_op = 'INSERT' then
      verb := public.tx_sex(member.user_id, actor, 'n.wish.added');
      message := public.tx(
          member.user_id, 'n.wish.line',
          public.tg_escape(coalesce(who, public.tx(member.user_id, 'n.partner'))), verb)
        || E'\n\n' || '<b>' || public.tg_escape(new.title) || '</b>'
        || case when new.details is null or btrim(new.details) = '' then ''
                else E'\n' || public.tg_escape(new.details) end;

    elsif tg_op = 'DELETE' then
      verb := public.tx_sex(member.user_id, actor, 'n.wish.removed');
      message := public.tx(
        member.user_id, 'n.wish.lineQuoted',
        public.tg_escape(coalesce(who, public.tx(member.user_id, 'n.partner'))),
        verb, public.tg_escape(old.title));

    elsif new.title is distinct from old.title then
      verb := public.tx_sex(member.user_id, actor, 'n.wish.renamed');
      message := public.tx(
          member.user_id, 'n.wish.line',
          public.tg_escape(coalesce(who, public.tx(member.user_id, 'n.partner'))), verb)
        || E'\n\n' || public.tg_escape(old.title)
        || ' → <b>' || public.tg_escape(new.title) || '</b>';

    elsif new.image_path is distinct from old.image_path then
      verb := public.tx_sex(member.user_id, actor, case
        when new.image_path is null then 'n.wish.photoRemoved'
        when old.image_path is null then 'n.wish.photoAdded'
        else 'n.wish.photoChanged'
      end);
      message := public.tx(
        member.user_id, 'n.wish.lineQuoted',
        public.tg_escape(coalesce(who, public.tx(member.user_id, 'n.partner'))),
        verb, public.tg_escape(new.title));

    else
      verb := public.tx_sex(member.user_id, actor, 'n.wish.edited');
      message := public.tx(
        member.user_id, 'n.wish.lineQuoted',
        public.tg_escape(coalesce(who, public.tx(member.user_id, 'n.partner'))),
        verb, public.tg_escape(new.title));
    end if;

    perform public.tg_notify_self(member.user_id, message, 'wishlist');
  end loop;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Восстановление огонька: отказы тоже видит человек, значит и они переводятся.
-- Тело не меняется - только тексты исключений.

create or replace function public.restore_checkin_day(target_date date, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  free_slot smallint;
begin
  if me is null or not public.is_member() then
    raise exception '%', public.tx(me, 'e.noAccess');
  end if;

  if target_date >= today then
    raise exception '%', public.tx(me, 'e.restorePast');
  end if;

  if target_date < today - 7 then
    raise exception '%', public.tx(me, 'e.restoreTooOld');
  end if;

  if exists (select 1 from public.checkins c where c.user_id = me and c.date = target_date) then
    raise exception '%', public.tx(me, 'e.restoreExists');
  end if;

  select s into free_slot
    from generate_series(1, 2) s
   where not exists (
     select 1 from public.checkin_restores r
      where r.user_id = me
        and r.month = date_trunc('month', target_date::timestamp)::date
        and r.slot = s)
   order by s
   limit 1;

  if free_slot is null then
    raise exception '%', public.tx(me, 'e.restoreNoneLeft');
  end if;

  insert into public.checkin_restores (user_id, date, slot)
  values (me, target_date, free_slot);
end;
$$;

revoke execute on function public.cycle_tip_key(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Цикл.
--
-- Три сообщения, и у двух из них два адресата с разными языками: владелец
-- раздела и партнёр, которому он открыл доступ. Заголовок один и тот же,
-- но берётся дважды - на языке каждого.

create or replace function public.send_cycle_notices()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
  end loop;

  return sent;
end;
$$;

-- Старая подсказка одним русским текстом больше не нужна: её место занял
-- ключ, а сами строки уехали в словарь
drop function if exists public.cycle_tip(text, int);
