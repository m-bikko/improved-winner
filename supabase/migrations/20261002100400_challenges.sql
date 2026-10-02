-- Челлендж на двоих.
--
-- Одна цель на N дней для обоих: 10 000 шагов, без сладкого, видеозвонок
-- каждый вечер. Каждый отмечается сам, оба видят клетки друг друга и общую
-- серию - дни, когда отметились оба. На расстоянии это то, что держит:
-- клетка второго уже закрашена, а твоя ещё нет.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 80),
  icon text not null check (icon ~ '^[a-z_]{1,30}$'),
  days smallint not null check (days between 3 and 100),
  started_on date not null,
  -- Остановили раньше срока. Отметки после этой даты не принимаются
  stopped_on date,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint challenges_stop_after_start check (
    stopped_on is null or stopped_on between started_on and started_on + days - 1
  )
);

create index challenges_started on public.challenges (started_on desc);

comment on table public.challenges is
  'Челленджи на двоих: общий срок, отметки у каждого свои. Правят оба.';

create table public.challenge_marks (
  challenge_id uuid not null references public.challenges on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, date)
);

alter table public.challenges enable row level security;
alter table public.challenge_marks enable row level security;
revoke all on public.challenges from anon;
revoke all on public.challenge_marks from anon;

create policy challenges_select on public.challenges for select to authenticated
  using (public.is_member());
create policy challenges_insert on public.challenges for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy challenges_update on public.challenges for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy challenges_delete on public.challenges for delete to authenticated
  using (public.is_member());

create policy challenge_marks_select on public.challenge_marks for select to authenticated
  using (public.is_member());
create policy challenge_marks_insert on public.challenge_marks for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy challenge_marks_delete on public.challenge_marks for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Отметка - только внутри срока челленджа. Дату дня считает клиент,
-- поэтому «не в будущем» база проверить не может, а вот «в пределах
-- челленджа» - может и должна: иначе отметка за 31-й день тридцатидневного
-- сломала бы счёт «12 из 30»
create or replace function public.challenge_marks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select started_on, days, stopped_on into c
    from public.challenges where id = new.challenge_id;
  if new.date < c.started_on
     or new.date > c.started_on + c.days - 1
     or (c.stopped_on is not null and new.date > c.stopped_on) then
    raise exception 'challenge_marks_in_range: отметка вне дней челленджа'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.challenge_marks_guard() from public, anon, authenticated;

create trigger challenge_marks_guard
  before insert on public.challenge_marks
  for each row execute function public.challenge_marks_guard();

-- И обратное: сдвинуть начало или сократить срок так, чтобы уже
-- поставленные отметки оказались снаружи, нельзя. Иначе отметки остались бы
-- в базе, но выпали бы из счёта - тихая потеря чужих дней
create or replace function public.challenges_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.challenge_marks m
     where m.challenge_id = new.id
       and (m.date < new.started_on
            or m.date > new.started_on + new.days - 1
            or (new.stopped_on is not null and m.date > new.stopped_on))
  ) then
    raise exception 'challenges_keep_marks: отметки оказались бы вне срока'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.challenges_guard() from public, anon, authenticated;

create trigger challenges_guard
  before update of started_on, days, stopped_on on public.challenges
  for each row execute function public.challenges_guard();

-- ---------------------------------------------------------------------------
-- Уведомления: позвали в челлендж и отметились

insert into public.texts (key, lang, value) values
  ('n.challenge.invite', 'ru', '%1$s зовёт в челлендж'),
  ('n.challenge.invite', 'kk', '%1$s челленджге шақырады'),
  ('n.challenge.invite', 'en', '%1$s started a challenge for you both'),
  ('n.challenge.inviteBody', 'ru', '«%1$s» - %2$s %3$s, начало %4$s.'),
  ('n.challenge.inviteBody', 'kk', '«%1$s» - %2$s %3$s, басталуы %4$s.'),
  ('n.challenge.inviteBody', 'en', '“%1$s” - %2$s %3$s, starting %4$s.'),
  ('n.challenge.marked.male', 'ru', '%1$s отметился: «%2$s»'),
  ('n.challenge.marked.female', 'ru', '%1$s отметилась: «%2$s»'),
  ('n.challenge.marked.other', 'ru', '%1$s - отметка: «%2$s»'),
  ('n.challenge.marked.male', 'kk', '%1$s белгі қойды: «%2$s»'),
  ('n.challenge.marked.female', 'kk', '%1$s белгі қойды: «%2$s»'),
  ('n.challenge.marked.other', 'kk', '%1$s белгі қойды: «%2$s»'),
  ('n.challenge.marked.male', 'en', '%1$s checked in: “%2$s”'),
  ('n.challenge.marked.female', 'en', '%1$s checked in: “%2$s”'),
  ('n.challenge.marked.other', 'en', '%1$s checked in: “%2$s”'),
  ('n.challenge.yourTurn', 'ru', 'День %1$s из %2$s. Твой ход!'),
  ('n.challenge.yourTurn', 'kk', 'Күн: %1$s/%2$s. Енді сенің кезегің!'),
  ('n.challenge.yourTurn', 'en', 'Day %1$s of %2$s. Your turn!'),
  ('n.challenge.both', 'ru', 'День %1$s из %2$s - сегодня вы оба.'),
  ('n.challenge.both', 'kk', 'Күн: %1$s/%2$s - бүгін екеуің де белгі қойдыңдар.'),
  ('n.challenge.both', 'en', 'Day %1$s of %2$s - you both did it today.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_challenge()
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
  target := public.partner_of(new.created_by);
  if target is null then
    return new;
  end if;
  title := public.tx(target, 'n.challenge.invite', public.nick_for(target, new.created_by));
  body := public.tx(target, 'n.challenge.inviteBody',
                    new.title, new.days::text, public.tx_plural(target, 'n.day', new.days),
                    to_char(new.started_on, 'DD.MM'));
  perform public.tg_notify_partner(
    new.created_by,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'challenges');
  perform public.push_notify(target, title, body, 'challenges', '/challenges');
  return new;
end;
$$;

revoke execute on function public.tg_on_challenge() from public, anon, authenticated;

create trigger challenges_notify
  after insert on public.challenges
  for each row execute function public.tg_on_challenge();

create or replace function public.tg_on_challenge_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  c record;
  day_n int;
  title text;
  body text;
begin
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;
  select ch.title, ch.days, ch.started_on into c from public.challenges ch where ch.id = new.challenge_id;
  day_n := new.date - c.started_on + 1;
  title := public.tx_by(target, new.user_id, 'n.challenge.marked',
                        public.nick_for(target, new.user_id), c.title);
  if exists (
    select 1 from public.challenge_marks m
     where m.challenge_id = new.challenge_id and m.user_id = target and m.date = new.date
  ) then
    body := public.tx(target, 'n.challenge.both', day_n::text, c.days::text);
  else
    body := public.tx(target, 'n.challenge.yourTurn', day_n::text, c.days::text);
  end if;
  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'challenges');
  perform public.push_notify(target, title, body, 'challenges', '/challenges');
  return new;
end;
$$;

revoke execute on function public.tg_on_challenge_mark() from public, anon, authenticated;

create trigger challenge_marks_notify
  after insert on public.challenge_marks
  for each row execute function public.tg_on_challenge_mark();
