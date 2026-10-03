-- Пауза в ссоре.
--
-- Когда спор накаляется, один нажимает «мне нужна пауза» и выбирает срок:
-- 20 минут, час, до вечера. Второму приходит спокойное уведомление вместо
-- тишины и хлопнувшей двери: это не обида, а время остыть. Когда срок
-- выходит, обоим приходит «пауза закончилась», и каждый вслепую пишет три
-- строки: что я чувствую, когда, что мне нужно. Строки открываются, когда
-- написали оба, - и из них получается мир, тема для обсуждения или
-- договорённость.
--
-- Правила держит база:
-- - пауза одна: вторая, пока первая не закрыта, ничего не значит;
-- - срок - до суток, укоротить может только тот, кто просил (второй
--   не может отменить чужую паузу), продлить - никто;
-- - закрыть можно только закончившуюся паузу, писать строки - тоже;
-- - строки второго не видны, пока не написал свои, а после того как
--   второй написал, свои уже не поправить.

create table public.pauses (
  id uuid primary key default gen_random_uuid(),
  started_by uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  end_notified_at timestamptz,
  closed_at timestamptz,
  outcome text check (outcome in ('peace', 'topic', 'agreement')),
  topic_id uuid references public.topics on delete set null,
  constraint pauses_length check (ends_at > started_at and ends_at <= started_at + interval '24 hours'),
  constraint pauses_closed check ((closed_at is null) = (outcome is null))
);

create unique index pauses_one_open on public.pauses ((true)) where closed_at is null;
create index pauses_started on public.pauses (started_at desc);

comment on table public.pauses is
  'Паузы в ссоре: кто попросил, до какого времени, чем закончилась.';

create table public.pause_notes (
  pause_id uuid not null references public.pauses on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  feel text not null check (length(btrim(feel)) between 1 and 300),
  when_text text check (when_text is null or length(btrim(when_text)) between 1 and 300),
  need text not null check (length(btrim(need)) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pause_id, user_id)
);

alter table public.pauses enable row level security;
alter table public.pause_notes enable row level security;
revoke all on public.pauses from anon;
revoke all on public.pause_notes from anon;

create policy pauses_select on public.pauses for select to authenticated using (public.is_member());
create policy pauses_insert on public.pauses for insert to authenticated
  with check (public.is_member() and started_by = (select auth.uid()) and closed_at is null);
create policy pauses_update on public.pauses for update to authenticated
  using (public.is_member()) with check (public.is_member());

-- Кто и когда может менять паузу - не политика, а триггер: правило зависит
-- от того, ЧТО меняется
create or replace function public.pauses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Начало - сейчас, а не когда скажет клиент: иначе «пауза на сутки»
    -- растягивалась бы задним числом
    new.started_at := now();
    new.end_notified_at := null;
    if new.ends_at < now() + interval '1 minute' then
      raise exception 'pauses_guard: пауза короче минуты' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.started_by <> old.started_by or new.started_at <> old.started_at then
    raise exception 'pauses_guard: начало паузы не меняется' using errcode = '23514';
  end if;
  if new.ends_at <> old.ends_at then
    if old.closed_at is not null then
      raise exception 'pauses_guard: пауза уже закрыта' using errcode = '23514';
    end if;
    if new.ends_at > old.ends_at then
      raise exception 'pauses_guard: паузу можно только укоротить' using errcode = '23514';
    end if;
    if (select auth.uid()) is distinct from old.started_by then
      raise exception 'pauses_guard: закончить паузу раньше может только тот, кто её попросил'
        using errcode = '42501';
    end if;
    -- Закончили раньше - «пауза закончилась» уходит сразу (триггер
    -- уведомлений), и ежеминутный прогон её уже не повторит
    if new.ends_at <= now() and old.end_notified_at is null then
      new.end_notified_at := now();
    end if;
  end if;
  if new.closed_at is not null and old.closed_at is null and old.ends_at > now() and new.ends_at > now() then
    raise exception 'pauses_guard: пауза ещё идёт' using errcode = '23514';
  end if;
  if old.closed_at is not null and new.closed_at is distinct from old.closed_at then
    raise exception 'pauses_guard: закрытая пауза не открывается' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pauses_guard before insert or update on public.pauses
  for each row execute function public.pauses_guard();

create or replace function public.pause_noted_by(of_pause uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pause_notes n where n.pause_id = of_pause and n.user_id = who)
$$;

revoke execute on function public.pause_noted_by(uuid, uuid) from public, anon;
grant execute on function public.pause_noted_by(uuid, uuid) to authenticated;

-- Писать строки - когда пауза закончилась и ещё не закрыта
create or replace function public.pause_writable(of_pause uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pauses p where p.id = of_pause and p.ends_at <= now() and p.closed_at is null
  )
$$;

revoke execute on function public.pause_writable(uuid) from public, anon;
grant execute on function public.pause_writable(uuid) to authenticated;

create or replace function public.pause_noted_by_partner(of_pause uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pause_notes n where n.pause_id = of_pause and n.user_id <> (select auth.uid())
  )
$$;

revoke execute on function public.pause_noted_by_partner(uuid) from public, anon;
grant execute on function public.pause_noted_by_partner(uuid) to authenticated;

create policy pause_notes_select on public.pause_notes for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.pause_noted_by(pause_id, (select auth.uid())))
  );
create policy pause_notes_insert on public.pause_notes for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()) and public.pause_writable(pause_id));
-- Поправить свои строки - пока второй не написал свои
create policy pause_notes_update on public.pause_notes for update to authenticated
  using (
    public.is_member() and user_id = (select auth.uid())
    and public.pause_writable(pause_id) and not public.pause_noted_by_partner(pause_id)
  )
  with check (public.is_member() and user_id = (select auth.uid()));

create or replace function public.pause_notes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pause_notes_touch before update on public.pause_notes
  for each row execute function public.pause_notes_touch();

-- Кто уже написал - без самих строк
create or replace function public.pause_progress()
returns table (pause_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select n.pause_id, n.user_id from public.pause_notes n where public.is_member()
$$;

revoke execute on function public.pause_progress() from public, anon;
grant execute on function public.pause_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- Уведомления

insert into public.texts (key, lang, value) values
  ('n.pause.asked', 'ru', '%1$s: нужна пауза до %2$s'),
  ('n.pause.asked', 'kk', '%1$s: %2$s дейін үзіліс керек'),
  ('n.pause.asked', 'en', '%1$s needs a pause until %2$s'),
  ('n.pause.askedBody', 'ru', 'Это не обида, а время остыть. Когда пауза закончится, вы вернётесь к разговору.'),
  ('n.pause.askedBody', 'kk', 'Бұл өкпе емес, сабаға түсу уақыты. Үзіліс біткенде әңгімеге қайта ораласыңдар.'),
  ('n.pause.askedBody', 'en', 'It is not a sulk, just time to cool down. When it ends, you will come back to the talk.'),
  ('n.pause.over', 'ru', 'Пауза закончилась'),
  ('n.pause.over', 'kk', 'Үзіліс аяқталды'),
  ('n.pause.over', 'en', 'The pause is over'),
  ('n.pause.overBody', 'ru', 'Начните с трёх строк: что чувствую, когда, что нужно. Они откроются, когда напишут оба.'),
  ('n.pause.overBody', 'kk', 'Үш жолдан бастаңдар: не сезінемін, қашан, маған не керек. Екеуің де жазғанда ашылады.'),
  ('n.pause.overBody', 'en', 'Start with three lines: what I feel, when, what I need. They open once you have both written.'),
  ('n.pause.noted.male', 'ru', '%1$s написал свои три строки'),
  ('n.pause.noted.female', 'ru', '%1$s написала свои три строки'),
  ('n.pause.noted.other', 'ru', '%1$s: три строки готовы'),
  ('n.pause.noted.male', 'kk', '%1$s өз үш жолын жазды'),
  ('n.pause.noted.female', 'kk', '%1$s өз үш жолын жазды'),
  ('n.pause.noted.other', 'kk', '%1$s өз үш жолын жазды'),
  ('n.pause.noted.male', 'en', '%1$s wrote their three lines'),
  ('n.pause.noted.female', 'en', '%1$s wrote their three lines'),
  ('n.pause.noted.other', 'en', '%1$s wrote their three lines'),
  ('n.pause.notedBody', 'ru', 'Напиши свои - и откроются обе.'),
  ('n.pause.notedBody', 'kk', 'Өзіңдікін жаз - екеуі де ашылады.'),
  ('n.pause.notedBody', 'en', 'Write yours and both will open.'),
  ('n.pause.open', 'ru', 'Строки открыты'),
  ('n.pause.open', 'kk', 'Жолдар ашылды'),
  ('n.pause.open', 'en', 'The lines are open'),
  ('n.pause.openBody', 'ru', 'Прочитайте друг друга - и решите, что дальше: мир, тема или договорённость.'),
  ('n.pause.openBody', 'kk', 'Бір-біріңді оқыңдар - әрі қарай не болатынын шешіңдер: татуласу, тақырып не келісім.'),
  ('n.pause.openBody', 'en', 'Read each other, then decide what is next: peace, a topic or an agreement.'),
  ('n.pause.peace.male', 'ru', '%1$s отметил: мир'),
  ('n.pause.peace.female', 'ru', '%1$s отметила: мир'),
  ('n.pause.peace.other', 'ru', '%1$s: мир'),
  ('n.pause.peace.male', 'kk', '%1$s белгіледі: татуластық'),
  ('n.pause.peace.female', 'kk', '%1$s белгіледі: татуластық'),
  ('n.pause.peace.other', 'kk', '%1$s белгіледі: татуластық'),
  ('n.pause.peace.male', 'en', '%1$s marked it: peace'),
  ('n.pause.peace.female', 'en', '%1$s marked it: peace'),
  ('n.pause.peace.other', 'en', '%1$s marked it: peace'),
  ('n.pause.peaceBody', 'ru', 'Спасибо, что вернулись к разговору.'),
  ('n.pause.peaceBody', 'kk', 'Әңгімеге қайта оралғандарыңа рақмет.'),
  ('n.pause.peaceBody', 'en', 'Thank you for coming back to the talk.')
on conflict (key, lang) do update set value = excluded.value;

-- Время конца - по часам получателя
create or replace function public.pause_clock(target uuid, at timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(at at time zone coalesce(
    (select p.timezone from public.profiles p where p.user_id = target), 'Asia/Almaty'), 'HH24:MI')
$$;

revoke execute on function public.pause_clock(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.pause_send_over(of_pause uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  for m in select am.user_id from public.app_members am loop
    perform public.tg_notify_self(
      m.user_id,
      '<b>' || public.tg_escape(public.tx(m.user_id, 'n.pause.over')) || '</b>'
        || E'\n\n' || public.tg_escape(public.tx(m.user_id, 'n.pause.overBody')),
      'pause');
    perform public.push_notify(
      m.user_id, public.tx(m.user_id, 'n.pause.over'), public.tx(m.user_id, 'n.pause.overBody'), 'pause', '/pause');
  end loop;
end;
$$;

revoke execute on function public.pause_send_over(uuid) from public, anon, authenticated;

create or replace function public.tg_on_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  title text;
begin
  target := public.partner_of(new.started_by);
  if tg_op = 'INSERT' then
    if target is null then
      return new;
    end if;
    title := public.tx(target, 'n.pause.asked',
                       public.nick_for(target, new.started_by), public.pause_clock(target, new.ends_at));
    perform public.tg_notify_partner(
      new.started_by,
      '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(public.tx(target, 'n.pause.askedBody')),
      'pause');
    perform public.push_notify(target, title, public.tx(target, 'n.pause.askedBody'), 'pause', '/pause');
    return new;
  end if;

  -- Закончили раньше: отметку поставил pauses_guard, рассылка - здесь
  if new.ends_at < old.ends_at and new.end_notified_at is not null and old.end_notified_at is null then
    perform public.pause_send_over(new.id);
  end if;

  if new.outcome = 'peace' and old.outcome is null then
    target := public.partner_of((select auth.uid()));
    if target is not null then
      title := public.tx_by(target, (select auth.uid()), 'n.pause.peace', public.nick_for(target, (select auth.uid())));
      perform public.tg_notify_partner(
        (select auth.uid()),
        '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(public.tx(target, 'n.pause.peaceBody')),
        'pause');
      perform public.push_notify(target, title, public.tx(target, 'n.pause.peaceBody'), 'pause', '/pause');
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_on_pause() from public, anon, authenticated;

create trigger pauses_notify after insert or update on public.pauses
  for each row execute function public.tg_on_pause();

create or replace function public.tg_on_pause_note()
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
  if public.pause_noted_by(new.pause_id, target) then
    title := public.tx(target, 'n.pause.open');
    body := public.tx(target, 'n.pause.openBody');
  else
    title := public.tx_by(target, new.user_id, 'n.pause.noted', public.nick_for(target, new.user_id));
    body := public.tx(target, 'n.pause.notedBody');
  end if;
  perform public.tg_notify_partner(
    new.user_id, '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body), 'pause');
  perform public.push_notify(target, title, body, 'pause', '/pause');
  return new;
end;
$$;

revoke execute on function public.tg_on_pause_note() from public, anon, authenticated;

create trigger pause_notes_notify after insert on public.pause_notes
  for each row execute function public.tg_on_pause_note();

-- Пауза истекла сама - раз в минуту: пять минут лишней тишины после
-- обещанного времени читались бы как «ещё обижается»
create or replace function public.send_pause_ends()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  sent int := 0;
begin
  for p in
    select id from public.pauses
     where closed_at is null and end_notified_at is null and ends_at <= now()
  loop
    update public.pauses set end_notified_at = now() where id = p.id;
    perform public.pause_send_over(p.id);
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_pause_ends() from public, anon, authenticated;

select cron.schedule('pause-ends', '* * * * *', 'select public.send_pause_ends()');
