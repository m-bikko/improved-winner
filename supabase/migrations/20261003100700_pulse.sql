-- Разговор месяца.
--
-- Раз в месяц - пять коротких оценок от 1 до 10: близость, поддержка, время
-- вместе, общение, общее будущее. Оба отвечают вслепую, ответы открываются,
-- когда ответили оба. Через несколько месяцев видно, что растёт и о чём
-- стоит поговорить - раньше, чем это станет ссорой.
--
-- Оценки - массивом из пяти чисел по порядку областей. Порядок и названия
-- областей живут в приложении (PULSE_AREAS) и не переставляются: иначе
-- прошлые месяцы поменяли бы смысл.

create table public.pulse_entries (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Первое число месяца - так месяц сравнивается и сортируется как дата
  month date not null check (extract(day from month) = 1),
  scores smallint[] not null
    check (cardinality(scores) = 5 and 1 <= all (scores) and 10 >= all (scores)),
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

comment on table public.pulse_entries is
  'Разговор месяца: пять оценок 1-10. Чужие видны после своих за тот же месяц.';

alter table public.pulse_entries enable row level security;
revoke all on public.pulse_entries from anon;

create or replace function public.pulse_done_by_me(of_month date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pulse_entries e where e.user_id = (select auth.uid()) and e.month = of_month
  )
$$;

create or replace function public.pulse_done_by_partner(of_month date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pulse_entries e where e.user_id <> (select auth.uid()) and e.month = of_month
  )
$$;

revoke execute on function public.pulse_done_by_me(date) from public, anon;
revoke execute on function public.pulse_done_by_partner(date) from public, anon;
grant execute on function public.pulse_done_by_me(date) to authenticated;
grant execute on function public.pulse_done_by_partner(date) to authenticated;

-- Слепо, как вопрос дня: чужие оценки - только после своих за тот же месяц,
-- а после раскрытия свои уже не поправить
create policy pulse_select on public.pulse_entries for select to authenticated
  using (public.is_member() and (user_id = (select auth.uid()) or public.pulse_done_by_me(month)));
create policy pulse_insert on public.pulse_entries for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy pulse_update on public.pulse_entries for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()) and not public.pulse_done_by_partner(month))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy pulse_delete on public.pulse_entries for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()) and not public.pulse_done_by_partner(month));

create or replace function public.pulse_progress()
returns table (month date, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.month, e.user_id from public.pulse_entries e where public.is_member()
$$;

revoke execute on function public.pulse_progress() from public, anon;
grant execute on function public.pulse_progress() to authenticated;

create or replace function public.pulse_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pulse_touch before update on public.pulse_entries
  for each row execute function public.pulse_touch();

-- ---------------------------------------------------------------------------
-- Уведомления: второй ответил / ответы открыты; и в последний день месяца
-- в 19:00 - тому, кто ещё не ответил

insert into public.texts (key, lang, value) values
  ('n.pulse.answered.male', 'ru', '%1$s ответил на разговор месяца'),
  ('n.pulse.answered.female', 'ru', '%1$s ответила на разговор месяца'),
  ('n.pulse.answered.other', 'ru', '%1$s ответил(а) на разговор месяца'),
  ('n.pulse.answered.male', 'kk', '%1$s ай сұхбатына жауап берді'),
  ('n.pulse.answered.female', 'kk', '%1$s ай сұхбатына жауап берді'),
  ('n.pulse.answered.other', 'kk', '%1$s ай сұхбатына жауап берді'),
  ('n.pulse.answered.male', 'en', '%1$s answered this month''s check-in'),
  ('n.pulse.answered.female', 'en', '%1$s answered this month''s check-in'),
  ('n.pulse.answered.other', 'en', '%1$s answered this month''s check-in'),
  ('n.pulse.yourTurn', 'ru', 'Пять оценок - и откроются ответы обоих.'),
  ('n.pulse.yourTurn', 'kk', 'Бес баға - және екеуіңнің жауаптарың ашылады.'),
  ('n.pulse.yourTurn', 'en', 'Five quick scores and both answers will open.'),
  ('n.pulse.revealed', 'ru', 'Разговор месяца открыт'),
  ('n.pulse.revealed', 'kk', 'Ай сұхбаты ашылды'),
  ('n.pulse.revealed', 'en', 'This month''s check-in is open'),
  ('n.pulse.revealedBody', 'ru', 'Посмотрите ответы вместе - и поговорите о том, что откликнулось.'),
  ('n.pulse.revealedBody', 'kk', 'Жауаптарды бірге қараңдар - көңілге тигені туралы сөйлесіңдер.'),
  ('n.pulse.revealedBody', 'en', 'Look at the answers together and talk about what stood out.'),
  ('n.pulse.remind', 'ru', 'Разговор месяца'),
  ('n.pulse.remind', 'kk', 'Ай сұхбаты'),
  ('n.pulse.remind', 'en', 'Monthly check-in'),
  ('n.pulse.remindBody', 'ru', 'Месяц заканчивается - пять оценок, пара минут.'),
  ('n.pulse.remindBody', 'kk', 'Ай аяқталып келеді - бес баға, екі минут.'),
  ('n.pulse.remindBody', 'en', 'The month is ending - five scores, two minutes.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  title text;
  body text;
begin
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;
  if exists (select 1 from public.pulse_entries e where e.user_id = target and e.month = new.month) then
    title := public.tx(target, 'n.pulse.revealed');
    body := public.tx(target, 'n.pulse.revealedBody');
  else
    title := public.tx_by(target, new.user_id, 'n.pulse.answered', public.nick_for(target, new.user_id));
    body := public.tx(target, 'n.pulse.yourTurn');
  end if;
  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'pulse');
  perform public.push_notify(target, title, body, 'pulse', '/pulse');
  return new;
end;
$$;

revoke execute on function public.tg_on_pulse() from public, anon, authenticated;

create trigger pulse_notify after insert on public.pulse_entries
  for each row execute function public.tg_on_pulse();

create table if not exists public.pulse_asks (
  user_id uuid not null references auth.users on delete cascade,
  month date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.pulse_asks enable row level security;
revoke all on public.pulse_asks from anon, public;
create policy pulse_asks_select on public.pulse_asks for select to authenticated using (public.is_member());

create or replace function public.send_pulse_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  person record;
  local_now timestamp;
  today date;
  this_month date;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;
    -- Последний день месяца, 19:00
    if extract(hour from local_now)::int <> 19 or extract(month from today + 1) = extract(month from today) then
      continue;
    end if;
    this_month := date_trunc('month', today)::date;
    if exists (select 1 from public.pulse_asks a where a.user_id = person.user_id and a.month = this_month) then
      continue;
    end if;
    insert into public.pulse_asks (user_id, month) values (person.user_id, this_month) on conflict do nothing;
    if exists (select 1 from public.pulse_entries e where e.user_id = person.user_id and e.month = this_month) then
      continue;
    end if;
    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tg_escape(public.tx(person.user_id, 'n.pulse.remind')) || '</b>'
        || E'\n\n' || public.tg_escape(public.tx(person.user_id, 'n.pulse.remindBody')),
      'pulse');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.pulse.remind'),
      public.tx(person.user_id, 'n.pulse.remindBody'),
      'pulse',
      '/pulse');
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_pulse_reminders() from anon, public;

select cron.schedule('pulse-reminders', '0 * * * *', 'select public.send_pulse_reminders()');
