-- До встречи.
--
-- Пара живёт порознь, и главная дата на горизонте почти всегда одна -
-- следующая встреча. Счётчик «через 4 дня вместе» на главной, общий план
-- на эти дни (что сделать, куда сходить, что посмотреть) и после встречи -
-- одним нажатием воспоминание в ленту.
--
-- Это не «важная дата» из раздела дат: та повторяется каждый год и бывает
-- одним днём, а встреча - конкретный отрезок, у которого есть план.

-- ---------------------------------------------------------------------------
-- Новые виды уведомлений - сразу все этой серии миграций

alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters',
    'nudge', 'gratitude', 'weigh_in', 'updates',
    'question', 'watch', 'prep', 'memories', 'challenges', 'savings',
    'meetings', 'voice', 'quiz', 'names', 'pregnancy', 'pulse'
  ));

-- ---------------------------------------------------------------------------

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  place text check (place is null or length(btrim(place)) between 1 and 120),
  note text check (note is null or length(note) <= 500),
  -- Воспоминание, в которое встреча превратилась: после него приглашение
  -- «сохранить в ленту» больше не показывается
  memory_id uuid references public.memories on delete set null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_dates check (ends_on >= starts_on and ends_on - starts_on <= 90)
);

create index meetings_starts on public.meetings (starts_on desc);

comment on table public.meetings is
  'Встречи пары: отрезок дат, место, план. Правят оба.';

create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  done boolean not null default false,
  -- Откуда пункт: из вишлиста, из «Смотрим вместе» или придуман
  source text check (source is null or source in ('wish', 'watch')),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index meeting_items_meeting on public.meeting_items (meeting_id, created_at);

alter table public.meetings enable row level security;
alter table public.meeting_items enable row level security;
revoke all on public.meetings from anon;
revoke all on public.meeting_items from anon;

-- Встреча общая: завести, поправить и удалить может любой из двоих
create policy meetings_select on public.meetings for select to authenticated using (public.is_member());
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy meetings_update on public.meetings for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy meetings_delete on public.meetings for delete to authenticated using (public.is_member());

create policy meeting_items_select on public.meeting_items for select to authenticated using (public.is_member());
create policy meeting_items_insert on public.meeting_items for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy meeting_items_update on public.meeting_items for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy meeting_items_delete on public.meeting_items for delete to authenticated using (public.is_member());

-- Встречи не пересекаются. Два плана на одни и те же дни - это одна
-- встреча, записанная дважды, и счётчик на главной не знал бы, какой верить
create or replace function public.meetings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.meetings m
     where m.id <> new.id
       and daterange(m.starts_on, m.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'meetings_no_overlap: на эти дни встреча уже есть'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.meetings_guard() from public, anon, authenticated;

create trigger meetings_guard
  before insert or update of starts_on, ends_on on public.meetings
  for each row execute function public.meetings_guard();

-- ---------------------------------------------------------------------------
-- Уведомления: второй завёл встречу; накануне - обоим

insert into public.texts (key, lang, value) values
  ('n.meeting.added.male', 'ru', '%1$s отметил встречу'),
  ('n.meeting.added.female', 'ru', '%1$s отметила встречу'),
  ('n.meeting.added.other', 'ru', '%1$s отметил(а) встречу'),
  ('n.meeting.added.male', 'kk', '%1$s кездесуді белгіледі'),
  ('n.meeting.added.female', 'kk', '%1$s кездесуді белгіледі'),
  ('n.meeting.added.other', 'kk', '%1$s кездесуді белгіледі'),
  ('n.meeting.added.male', 'en', '%1$s planned a meeting'),
  ('n.meeting.added.female', 'en', '%1$s planned a meeting'),
  ('n.meeting.added.other', 'en', '%1$s planned a meeting'),
  ('n.meeting.dates', 'ru', 'С %1$s по %2$s - до встречи %3$s %4$s.'),
  ('n.meeting.dates', 'kk', '%1$s - %2$s. Кездесуге %3$s %4$s қалды.'),
  ('n.meeting.dates', 'en', '%1$s to %2$s - %3$s %4$s to go.'),
  ('n.meeting.tomorrow', 'ru', 'Завтра вы вместе'),
  ('n.meeting.tomorrow', 'kk', 'Ертең бірге боласыңдар'),
  ('n.meeting.tomorrow', 'en', 'Tomorrow you are together'),
  ('n.meeting.tomorrowBody', 'ru', 'Загляните в план встречи - всё ли готово.'),
  ('n.meeting.tomorrowBody', 'kk', 'Кездесу жоспарына қараңдар - бәрі дайын ба.'),
  ('n.meeting.tomorrowBody', 'en', 'Take a look at the plan - is everything ready?')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_meeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  tz text;
  days int;
  title text;
  body text;
begin
  target := public.partner_of(new.created_by);
  if target is null then
    return new;
  end if;
  -- «Через сколько дней» - по местной дате получателя
  select coalesce(p.timezone, 'Asia/Almaty') into tz from public.profiles p where p.user_id = target;
  days := greatest(new.starts_on - (now() at time zone coalesce(tz, 'Asia/Almaty'))::date, 0);
  title := public.tx_by(target, new.created_by, 'n.meeting.added', public.nick_for(target, new.created_by));
  body := public.tx(target, 'n.meeting.dates',
                    to_char(new.starts_on, 'DD.MM'), to_char(new.ends_on, 'DD.MM'),
                    days::text, public.tx_plural(target, 'n.day', days));
  perform public.tg_notify_partner(
    new.created_by,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'meetings');
  perform public.push_notify(target, title, body, 'meetings', '/meetings');
  return new;
end;
$$;

revoke execute on function public.tg_on_meeting() from public, anon, authenticated;

create trigger meetings_notify
  after insert on public.meetings
  for each row execute function public.tg_on_meeting();

create table if not exists public.meeting_notices (
  meeting_id uuid not null references public.meetings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

alter table public.meeting_notices enable row level security;
revoke all on public.meeting_notices from anon, public;
create policy meeting_notices_select on public.meeting_notices
  for select to authenticated using (public.is_member());

-- Накануне в 19:00 по месту: вечер перед встречей - время собраться
create or replace function public.send_meeting_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  person record;
  item record;
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
    if extract(hour from local_now)::int <> 19 then
      continue;
    end if;

    for item in select id from public.meetings where starts_on = today + 1
    loop
      if exists (
        select 1 from public.meeting_notices n where n.meeting_id = item.id and n.user_id = person.user_id
      ) then
        continue;
      end if;
      insert into public.meeting_notices (meeting_id, user_id) values (item.id, person.user_id)
      on conflict do nothing;
      perform public.tg_notify_self(
        person.user_id,
        '<b>' || public.tg_escape(public.tx(person.user_id, 'n.meeting.tomorrow')) || '</b>'
          || E'\n\n' || public.tg_escape(public.tx(person.user_id, 'n.meeting.tomorrowBody')),
        'meetings');
      perform public.push_notify(
        person.user_id,
        public.tx(person.user_id, 'n.meeting.tomorrow'),
        public.tx(person.user_id, 'n.meeting.tomorrowBody'),
        'meetings',
        '/meetings');
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_meeting_reminders() from anon, public;

select cron.schedule('meeting-reminders', '0 * * * *', 'select public.send_meeting_reminders()');
