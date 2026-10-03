-- «Это или то»: насколько хорошо мы знаем друг друга.
--
-- Раунд - десять пар («Море / Горы»). В каждой паре человек выбирает, что
-- ближе ему, и угадывает, что выберет второй. Когда раунд прошли оба,
-- видно, сколько угадал каждый и в скольких парах вкусы совпали. Повод
-- для разговора в вечер, когда встретиться нельзя.
--
-- Тексты пар - в словарях приложения (tot.<id>.a / .b), здесь только id.
-- Ответы второго не видны, пока не пройден свой раунд: иначе угадывать
-- было бы нечего.

create table public.tot_rounds (
  id uuid primary key default gen_random_uuid(),
  pairs text[] not null check (cardinality(pairs) between 5 and 15),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.tot_answers (
  round_id uuid not null references public.tot_rounds on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  pair_id text not null check (pair_id ~ '^[a-z0-9_]{1,30}$'),
  -- 0 - первый вариант, 1 - второй
  pick smallint not null check (pick in (0, 1)),
  guess smallint not null check (guess in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, pair_id)
);

alter table public.tot_rounds enable row level security;
alter table public.tot_answers enable row level security;
revoke all on public.tot_rounds from anon;
revoke all on public.tot_answers from anon;

create policy tot_rounds_select on public.tot_rounds for select to authenticated using (public.is_member());
create policy tot_rounds_insert on public.tot_rounds for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));

-- Раунд пройден мной - ответил на все пары. security definer: политика
-- над своей же таблицей ушла бы в рекурсию
create or replace function public.tot_done_by(round uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.tot_answers a where a.round_id = round and a.user_id = who)
       = (select cardinality(r.pairs) from public.tot_rounds r where r.id = round)
$$;

revoke execute on function public.tot_done_by(uuid, uuid) from public, anon, authenticated;

create or replace function public.tot_done_by_me(round uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.tot_done_by(round, (select auth.uid()))
$$;

revoke execute on function public.tot_done_by_me(uuid) from public, anon;
grant execute on function public.tot_done_by_me(uuid) to authenticated;

create policy tot_answers_select on public.tot_answers for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.tot_done_by_me(round_id))
  );
-- Ответы окончательные: ни правки, ни удаления. Переиграть пару, узнав
-- выбор второго, - уже не игра
create policy tot_answers_insert on public.tot_answers for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

-- Сколько пар ответил каждый - без самих ответов: «второй уже прошёл, твой ход»
create or replace function public.tot_progress()
returns table (round_id uuid, user_id uuid, answered int)
language sql
stable
security definer
set search_path = ''
as $$
  select a.round_id, a.user_id, count(*)::int
    from public.tot_answers a
   where public.is_member()
   group by a.round_id, a.user_id
$$;

revoke execute on function public.tot_progress() from public, anon;
grant execute on function public.tot_progress() to authenticated;

-- Пара - из этого раунда
create or replace function public.tot_answers_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tot_rounds r where r.id = new.round_id and new.pair_id = any (r.pairs)
  ) then
    raise exception 'tot_answers_pair_in_round: такой пары в раунде нет'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.tot_answers_guard() from public, anon, authenticated;

create trigger tot_answers_guard
  before insert on public.tot_answers
  for each row execute function public.tot_answers_guard();

-- ---------------------------------------------------------------------------
-- Уведомления: второй прошёл раунд - «твой ход»; прошли оба - итог

insert into public.texts (key, lang, value) values
  ('n.tot.done.male', 'ru', '%1$s прошёл «Это или то»'),
  ('n.tot.done.female', 'ru', '%1$s прошла «Это или то»'),
  ('n.tot.done.other', 'ru', '%1$s прошёл(а) «Это или то»'),
  ('n.tot.done.male', 'kk', '%1$s «Бұл ма, әлде ол ма» ойынын өтті'),
  ('n.tot.done.female', 'kk', '%1$s «Бұл ма, әлде ол ма» ойынын өтті'),
  ('n.tot.done.other', 'kk', '%1$s «Бұл ма, әлде ол ма» ойынын өтті'),
  ('n.tot.done.male', 'en', '%1$s played This or that'),
  ('n.tot.done.female', 'en', '%1$s played This or that'),
  ('n.tot.done.other', 'en', '%1$s played This or that'),
  ('n.tot.yourTurn', 'ru', 'Твой ход - а потом сравните ответы.'),
  ('n.tot.yourTurn', 'kk', 'Енді сенің кезегің - содан кейін жауаптарды салыстырыңдар.'),
  ('n.tot.yourTurn', 'en', 'Your turn - then compare your answers.'),
  ('n.tot.results', 'ru', 'Результаты «Это или то»'),
  ('n.tot.results', 'kk', '«Бұл ма, әлде ол ма» нәтижелері'),
  ('n.tot.results', 'en', 'This or that: results'),
  ('n.tot.resultsBody', 'ru', 'Твои догадки: %1$s из %3$s. Тебя угадали: %2$s из %3$s.'),
  ('n.tot.resultsBody', 'kk', 'Сен %3$s ішінен %1$s таптың, сені %3$s ішінен %2$s тапты.'),
  ('n.tot.resultsBody', 'en', 'You guessed %1$s of %3$s, you were guessed %2$s of %3$s.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_tot_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  total int;
  mine int;
  theirs int;
  title text;
  body text;
begin
  -- Только ответ, которым человек закончил раунд
  if not public.tot_done_by(new.round_id, new.user_id) then
    return new;
  end if;
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;

  if public.tot_done_by(new.round_id, target) then
    select cardinality(pairs) into total from public.tot_rounds where id = new.round_id;
    -- Сколько угадал получатель (его догадки о выборе того, кто закончил)
    -- и сколько угадали его самого
    select count(*) into mine
      from public.tot_answers g join public.tot_answers p
        on p.round_id = g.round_id and p.pair_id = g.pair_id and p.user_id = new.user_id
     where g.round_id = new.round_id and g.user_id = target and g.guess = p.pick;
    select count(*) into theirs
      from public.tot_answers g join public.tot_answers p
        on p.round_id = g.round_id and p.pair_id = g.pair_id and p.user_id = target
     where g.round_id = new.round_id and g.user_id = new.user_id and g.guess = p.pick;
    title := public.tx(target, 'n.tot.results');
    body := public.tx(target, 'n.tot.resultsBody', mine::text, theirs::text, total::text);
  else
    title := public.tx_by(target, new.user_id, 'n.tot.done', public.nick_for(target, new.user_id));
    body := public.tx(target, 'n.tot.yourTurn');
  end if;

  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'quiz');
  perform public.push_notify(target, title, body, 'quiz', '/quiz');
  return new;
end;
$$;

revoke execute on function public.tg_on_tot_answer() from public, anon, authenticated;

create trigger tot_answers_notify
  after insert on public.tot_answers
  for each row execute function public.tg_on_tot_answer();
