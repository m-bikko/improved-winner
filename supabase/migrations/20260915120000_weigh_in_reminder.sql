-- Напоминание взвеситься - в 9 утра по месту.
--
-- Взвешивание имеет смысл только регулярное: расход, прогноз веса и состав
-- тела считаются регрессией, а регрессия по трём точкам за месяц - это
-- не тренд, а три точки. Забывается оно ровно потому, что делается натощак
-- и до всего остального: вспомнить о нём после завтрака уже поздно, число
-- за этот день будет другим.
--
-- Отсюда и час: девять утра - последний момент, когда напоминание ещё можно
-- выполнить сегодня. Просить взвеситься вечером бессмысленно - вечерний вес
-- с утренним в одном ряду не стоит.
--
-- Уже взвесился - молчим. Отметка о попытке ставится всё равно, чтобы
-- ежечасный запуск не спрашивал второй раз.

alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters',
    'nudge', 'gratitude', 'weigh_in'
  ));

-- Отметка «сегодня уже спрашивали». Та же роль, что у checkin_asks:
-- задание идёт каждый час, и без отметки один и тот же час в разных
-- запусках дал бы дубль.
create table if not exists public.weigh_in_asks (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.weigh_in_asks enable row level security;
revoke all on public.weigh_in_asks from anon, public;

-- Читать может участник, писать - только рассылка под service_role.
-- Строка тут ничего не значит сама по себе, но и отдавать её наружу незачем.
drop policy if exists weigh_in_asks_select on public.weigh_in_asks;
create policy weigh_in_asks_select on public.weigh_in_asks
  for select to authenticated
  using (public.is_member());

insert into public.texts (key, lang, value) values
  ('n.weighIn.title', 'ru', 'Взвеситься'),
  ('n.weighIn.title', 'kk', 'Өлшену'),
  ('n.weighIn.title', 'en', 'Time to weigh in'),
  ('n.weighIn.body', 'ru', 'Натощак и до завтрака - так числа сравнимы между собой. Одного веса достаточно: состав с умных весов необязателен.'),
  ('n.weighIn.body', 'kk', 'Аш қарынға, таңғы астан бұрын - сонда сандар өзара салыстырмалы болады. Салмақтың өзі жеткілікті: ақылды таразының құрамы міндетті емес.'),
  ('n.weighIn.body', 'en', 'Before breakfast and on an empty stomach - that is what makes the numbers comparable. Weight alone is enough; composition from smart scales is optional.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.send_weigh_in_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
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

    if extract(hour from local_now)::int <> 9 then
      continue;
    end if;

    if exists (
      select 1 from public.weigh_in_asks a
       where a.user_id = person.user_id and a.date = today
    ) then
      continue;
    end if;

    -- Уже взвесился сам - отметку ставим, напоминание не шлём. Напоминать
    -- о сделанном хуже, чем не напоминать вовсе: так уведомления и начинают
    -- игнорировать.
    if exists (
      select 1 from public.weight_log l
       where l.user_id = person.user_id and l.date = today
    ) then
      insert into public.weigh_in_asks (user_id, date) values (person.user_id, today)
      on conflict do nothing;
      continue;
    end if;

    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tx(person.user_id, 'n.weighIn.title') || '</b>' || E'\n\n'
        || public.tx(person.user_id, 'n.weighIn.body'),
      'weigh_in');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.weighIn.title'),
      public.tx(person.user_id, 'n.weighIn.body'),
      'weigh_in',
      '/profile'
    );

    insert into public.weigh_in_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.send_weigh_in_reminders() from anon, public;

select cron.schedule('weigh-in', '0 * * * *', 'select public.send_weigh_in_reminders()');
