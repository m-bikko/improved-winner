-- Уведомления зовут в приложение, а не пересказывают его.
--
-- Раньше ответ в теме и решение по ней приезжали целиком в телеграм и в push.
-- Это удобно ровно один раз - и разрушает сам разговор: прочитав всё из шторки,
-- в приложение уже не заходишь, а значит не отвечаешь, не закрываешь тему
-- и не видишь остального. Тексты переписки при этом лежат в двух местах,
-- и телеграм из них - то, над которым у нас нет никакой власти.
--
-- Теперь уведомление говорит ровно две вещи: что произошло и где смотреть.
-- Название темы остаётся - без него непонятно, о чём речь, и уведомление
-- превращается в «кто-то что-то сделал».
--
-- Отметка о самочувствии добавляется сюда же и по той же причине, но у неё
-- была отдельная поломка: партнёру не приходило вообще ничего. Раздел
-- задуман так, что ответ видит второй, - а узнать о нём он мог, только
-- открыв приложение по своей воле.

-- ---------------------------------------------------------------------------
-- Род по полу. Третья ветка обязана существовать: sex - nullable.
-- Каждое место выбирает свою бесполую формулировку само, потому что
-- универсальной хорошей нет, а «ответил(а)» - это отказ от решения.

create or replace function public.by_sex(person uuid, male text, female text, neutral text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case (select p.sex from public.profiles p where p.user_id = person)
           when 'male' then male
           when 'female' then female
           else neutral
         end
$$;

revoke execute on function public.by_sex(uuid, text, text, text) from public, anon, authenticated;

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
  );

  target := public.partner_of(new.created_by);
  if target is not null then
    perform public.push_notify(
      target,
      'Новая тема',
      author || ' ' || did || ' «' || new.title || '» - посмотри в приложении',
      '/topics/' || new.id
    );
  end if;

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
  );

  target := public.partner_of(new.author_id);
  if target is not null then
    perform public.push_notify(
      target,
      'Ответ в теме',
      author || ' ' || did || ' в «' || topic_title || '» - посмотри в приложении',
      '/topics/' || new.topic_id
    );
  end if;

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
  select nickname into author from public.profiles where user_id = actor;
  author := coalesce(author, 'Партнёр');
  did := public.by_sex(actor, 'закрыл', 'закрыла', 'закрыл(а)');

  perform public.tg_notify_partner(
    actor,
    author || ' ' || did || ' тему «' || public.tg_escape(new.title) || '»' || E'\n\n'
      || 'Посмотри в приложении, как решили.'
  );

  target := public.partner_of(actor);
  if target is not null then
    perform public.push_notify(
      target,
      'Тема закрыта',
      author || ' ' || did || ' «' || new.title || '» - посмотри, как решили',
      '/topics/' || new.id
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_on_topic_insert() from public, anon, authenticated;
revoke execute on function public.tg_on_comment_insert() from public, anon, authenticated;
revoke execute on function public.tg_on_topic_closed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Самочувствие
--
-- Порог в 30 минут, а не «уведомлять только на первую отметку»: отметка
-- меняется в течение дня по делу - утром «бодро», днём «болит голова», -
-- и именно такое изменение стоит знать. Но подряд идущие правки одной мысли
-- отправлять партнёру по разу каждую незачем.

create table public.checkin_notices (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  notified_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.checkin_notices enable row level security;
revoke all on public.checkin_notices from anon, authenticated;

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
  author := coalesce(author, 'Партнёр');
  did := public.by_sex(new.user_id, 'отметил', 'отметила', 'отметил(а)');
  feels := public.by_sex(new.user_id, 'он себя чувствует', 'она себя чувствует', 'дела');

  perform public.tg_notify_partner(
    new.user_id,
    author || ' ' || did || ', как себя чувствует' || E'\n\n'
      || 'Посмотри в приложении, как ' || feels || '.'
  );
  perform public.push_notify(
    target,
    'Самочувствие',
    author || ' ' || did || ', как себя чувствует - посмотри в приложении',
    '/checkin'
  );

  insert into public.checkin_notices (user_id, date) values (new.user_id, new.date)
  on conflict (user_id, date) do update set notified_at = now();

  return new;
end;
$$;

revoke execute on function public.tg_on_checkin() from public, anon, authenticated;

create trigger checkin_notify
  after insert or update on public.checkins
  for each row execute function public.tg_on_checkin();

-- Вопрос в 11:00 тоже должен открывать свой раздел, а не дневник
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
      '<b>Как ты сегодня?</b>' || E'\n\n'
        || 'Настроение, самочувствие, что угодно. Партнёр увидит.'
    );
    perform public.push_notify(
      person.user_id,
      'Как ты сегодня?',
      'Настроение и самочувствие - партнёр увидит',
      '/checkin'
    );

    insert into public.checkin_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.ask_checkins() from public, anon, authenticated;
