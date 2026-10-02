-- Вопрос дня.
--
-- Каждый день обоим приходит один и тот же вопрос. Каждый отвечает сам,
-- а ответ второго открывается только после своего. Пара живёт порознь,
-- и разговор «как день» быстро сводится к пересказу дел; вопрос даёт
-- повод поговорить о другом, а слепой ответ - честность: подстроиться
-- под уже прочитанное нельзя.
--
-- Тексты вопросов живут в словарях приложения, как подсказки цикла: три
-- языка и проверка полноты сборкой. В базе хранится только идентификатор
-- вопроса - этого достаточно, чтобы оба ответа относились к одному и тому же.

-- ---------------------------------------------------------------------------
-- Новые виды уведомлений - сразу все шесть разделов этой серии миграций,
-- чтобы CHECK не переписывать шесть раз подряд

alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters',
    'nudge', 'gratitude', 'weigh_in', 'updates',
    'question', 'watch', 'prep', 'memories', 'challenges', 'savings'
  ));

-- ---------------------------------------------------------------------------
-- Ответы

create table public.question_answers (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  question_id text not null check (question_id ~ '^[a-z0-9_]{1,30}$'),
  body text not null check (length(btrim(body)) > 0 and length(body) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index question_answers_date on public.question_answers (date desc);

comment on table public.question_answers is
  'Ответы на вопрос дня. Ответ партнёра виден только после своего за тот же день.';

alter table public.question_answers enable row level security;
revoke all on public.question_answers from anon;

-- Обе функции - security definer: политика над этой же таблицей, читающая
-- её, ушла бы в рекурсию. Тот же приём, что у is_member().

create or replace function public.question_answered_by_me(on_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_answers a
     where a.user_id = (select auth.uid()) and a.date = on_date
  )
$$;

create or replace function public.question_answered_by_partner(on_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_answers a
     where a.user_id <> (select auth.uid()) and a.date = on_date
  )
$$;

revoke execute on function public.question_answered_by_me(date) from public, anon;
revoke execute on function public.question_answered_by_partner(date) from public, anon;
grant execute on function public.question_answered_by_me(date) to authenticated;
grant execute on function public.question_answered_by_partner(date) to authenticated;

-- Свой ответ виден всегда, чужой - только когда есть свой за тот же день.
-- Именно политикой, а не экраном: экран обходится открытием консоли
create policy question_answers_select on public.question_answers
  for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.question_answered_by_me(date))
  );

create policy question_answers_insert on public.question_answers
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

-- Править и удалять свой ответ можно, пока второй не ответил. После
-- раскрытия ответ закрыт: переписать его, прочитав чужой, - ровно то,
-- от чего защищает слепой ответ
create policy question_answers_update on public.question_answers
  for update to authenticated
  using (
    public.is_member()
    and user_id = (select auth.uid())
    and not public.question_answered_by_partner(date)
  )
  with check (public.is_member() and user_id = (select auth.uid()));

create policy question_answers_delete on public.question_answers
  for delete to authenticated
  using (
    public.is_member()
    and user_id = (select auth.uid())
    and not public.question_answered_by_partner(date)
  );

-- Кто и на какой вопрос ответил - без текста.
--
-- Экрану это нужно до своего ответа: показать «партнёр уже ответил,
-- твой ход» и, главное, задать ТОТ ЖЕ вопрос. Вопрос дня считается
-- по дате из списка в приложении, и если между ответами вышла версия
-- с другим списком, второй получил бы другой вопрос. Поэтому вопрос дня,
-- на который уже есть ответ, берётся отсюда, а не из расписания.
create or replace function public.question_progress(since date)
returns table (date date, user_id uuid, question_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.date, a.user_id, a.question_id
    from public.question_answers a
   where public.is_member() and a.date >= since
$$;

revoke execute on function public.question_progress(date) from public, anon;
grant execute on function public.question_progress(date) to authenticated;

-- Оба ответа одного дня - на один вопрос. Клиент для этого и спрашивает
-- question_progress, а база держит правило на случай, если не спросил
create or replace function public.question_answers_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.question_answers o
     where o.date = new.date
       and o.user_id <> new.user_id
       and o.question_id <> new.question_id
  ) then
    raise exception 'question_answers_same_question: на этот день уже отвечали на другой вопрос'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.question_answers_guard() from public, anon, authenticated;

create trigger question_answers_guard
  before insert or update on public.question_answers
  for each row execute function public.question_answers_guard();

-- ---------------------------------------------------------------------------
-- Уведомления

insert into public.texts (key, lang, value) values
  ('n.question.answered.male', 'ru', '%1$s ответил на вопрос дня'),
  ('n.question.answered.female', 'ru', '%1$s ответила на вопрос дня'),
  ('n.question.answered.other', 'ru', '%1$s ответил(а) на вопрос дня'),
  ('n.question.answered.male', 'kk', '%1$s күн сұрағына жауап берді'),
  ('n.question.answered.female', 'kk', '%1$s күн сұрағына жауап берді'),
  ('n.question.answered.other', 'kk', '%1$s күн сұрағына жауап берді'),
  ('n.question.answered.male', 'en', '%1$s answered today''s question'),
  ('n.question.answered.female', 'en', '%1$s answered today''s question'),
  ('n.question.answered.other', 'en', '%1$s answered today''s question'),
  ('n.question.yourTurn', 'ru', 'Ответь - и откроются оба ответа.'),
  ('n.question.yourTurn', 'kk', 'Сен де жауап бер - екі жауап та ашылады.'),
  ('n.question.yourTurn', 'en', 'Answer yours and both will open.'),
  ('n.question.revealed', 'ru', 'Ответы открыты'),
  ('n.question.revealed', 'kk', 'Жауаптар ашылды'),
  ('n.question.revealed', 'en', 'Both answers are open'),
  ('n.question.revealedBody.male', 'ru', '%1$s тоже ответил - посмотрите, что получилось.'),
  ('n.question.revealedBody.female', 'ru', '%1$s тоже ответила - посмотрите, что получилось.'),
  ('n.question.revealedBody.other', 'ru', '%1$s тоже ответил(а) - посмотрите, что получилось.'),
  ('n.question.revealedBody.male', 'kk', '%1$s жауап берді - не шыққанын қараңдар.'),
  ('n.question.revealedBody.female', 'kk', '%1$s жауап берді - не шыққанын қараңдар.'),
  ('n.question.revealedBody.other', 'kk', '%1$s жауап берді - не шыққанын қараңдар.'),
  ('n.question.revealedBody.male', 'en', '%1$s answered too - see what you both said.'),
  ('n.question.revealedBody.female', 'en', '%1$s answered too - see what you both said.'),
  ('n.question.revealedBody.other', 'en', '%1$s answered too - see what you both said.'),
  ('n.question.remind', 'ru', 'Вопрос дня'),
  ('n.question.remind', 'kk', 'Күн сұрағы'),
  ('n.question.remind', 'en', 'Question of the day'),
  ('n.question.remindBody', 'ru', 'Пара минут - и вы узнаете друг о друге что-то новое.'),
  ('n.question.remindBody', 'kk', 'Екі минут - және бір-біріңнің жаңа қырын білесіңдер.'),
  ('n.question.remindBody', 'en', 'Two minutes, and you will learn something new about each other.'),
  ('n.question.waiting.male', 'ru', '%1$s уже ответил - его ответ откроется после твоего.'),
  ('n.question.waiting.female', 'ru', '%1$s уже ответила - её ответ откроется после твоего.'),
  ('n.question.waiting.other', 'ru', '%1$s уже ответил(а) - ответ откроется после твоего.'),
  ('n.question.waiting.male', 'kk', '%1$s жауап беріп қойды - оның жауабы сенікінен кейін ашылады.'),
  ('n.question.waiting.female', 'kk', '%1$s жауап беріп қойды - оның жауабы сенікінен кейін ашылады.'),
  ('n.question.waiting.other', 'kk', '%1$s жауап беріп қойды - оның жауабы сенікінен кейін ашылады.'),
  ('n.question.waiting.male', 'en', '%1$s has answered - his answer opens after yours.'),
  ('n.question.waiting.female', 'en', '%1$s has answered - her answer opens after yours.'),
  ('n.question.waiting.other', 'en', '%1$s has answered - their answer opens after yours.')
on conflict (key, lang) do update set value = excluded.value;

-- Род глагола - от того, КТО сделал, язык - того, КТО читает. Свой помощник,
-- а не tx_sex: тому нужен готовый кусок фразы, а здесь имя и глагол стоят
-- в разном порядке на разных языках, и подставлять надо в шаблон целиком
create or replace function public.tx_by(target uuid, actor uuid, key text, variadic args text[] default '{}')
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.tx(
    target,
    key || '.' || coalesce((select p.sex from public.profiles p where p.user_id = actor), 'other'),
    variadic args
  )
$$;

revoke execute on function public.tx_by(uuid, uuid, text, text[]) from public, anon, authenticated;

-- Имя того, кто сделал, - или «Партнёр» на языке читающего
create or replace function public.nick_for(target uuid, actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.nickname from public.profiles p where p.user_id = actor),
    public.tx(target, 'n.partner')
  )
$$;

revoke execute on function public.nick_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_on_question_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  who text;
  title text;
  body text;
begin
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;
  who := public.nick_for(target, new.user_id);

  -- Второй ответ раскрывает оба - это другое событие, и сказать о нём
  -- надо иначе: «твой ход» человеку, который уже ответил, звучало бы странно
  if exists (
    select 1 from public.question_answers o
     where o.user_id = target and o.date = new.date
  ) then
    title := public.tx(target, 'n.question.revealed');
    body := public.tx_by(target, new.user_id, 'n.question.revealedBody', who);
  else
    title := public.tx_by(target, new.user_id, 'n.question.answered', who);
    body := public.tx(target, 'n.question.yourTurn');
  end if;

  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'question');
  perform public.push_notify(target, title, body, 'question', '/question');
  return new;
end;
$$;

revoke execute on function public.tg_on_question_answer() from public, anon, authenticated;

create trigger question_answers_notify
  after insert on public.question_answers
  for each row execute function public.tg_on_question_answer();

-- ---------------------------------------------------------------------------
-- Напоминание в 20:00 по месту, если на сегодняшний вопрос ещё нет ответа.
--
-- Вечер, а не утро: на вопрос «что тебя сегодня удивило» утром ответить
-- нечем. Час свободен - письма в 9, даты в 10, еда и опрос в 11, советы
-- в 13, обед в 14, записки в 18, ужин в 21, вечерний опрос в 22.

create table if not exists public.question_asks (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.question_asks enable row level security;
revoke all on public.question_asks from anon, public;

create policy question_asks_select on public.question_asks
  for select to authenticated
  using (public.is_member());

create or replace function public.send_question_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  person record;
  local_now timestamp;
  today date;
  partner uuid;
  body text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 20 then
      continue;
    end if;

    if exists (
      select 1 from public.question_asks a
       where a.user_id = person.user_id and a.date = today
    ) then
      continue;
    end if;

    insert into public.question_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;

    -- Уже ответил - молчим: напоминать о сделанном хуже, чем не напоминать
    if exists (
      select 1 from public.question_answers a
       where a.user_id = person.user_id and a.date = today
    ) then
      continue;
    end if;

    -- Если второй уже ответил, это сильнее любого общего текста
    partner := public.partner_of(person.user_id);
    if partner is not null and exists (
      select 1 from public.question_answers a
       where a.user_id = partner and a.date = today
    ) then
      body := public.tx_by(person.user_id, partner, 'n.question.waiting',
                           public.nick_for(person.user_id, partner));
    else
      body := public.tx(person.user_id, 'n.question.remindBody');
    end if;

    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tg_escape(public.tx(person.user_id, 'n.question.remind')) || '</b>'
        || E'\n\n' || public.tg_escape(body),
      'question');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.question.remind'),
      body,
      'question',
      '/question'
    );
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.send_question_reminders() from anon, public;

select cron.schedule('question-reminders', '0 * * * *', 'select public.send_question_reminders()');
