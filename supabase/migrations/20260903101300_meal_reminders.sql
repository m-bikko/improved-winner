-- Напоминания о незаполненных приёмах пищи.
--
-- В 11:00 по местному времени, если завтрак пуст, приходит напоминание.
-- То же для обеда в 14:00 и ужина в 21:00.
--
-- Планировщик живёт в базе (pg_cron), а не на Vercel: у Vercel Cron на Hobby
-- лимит в один запуск в сутки, а нужно три. Заодно вся логика оказывается
-- рядом с данными, по которым принимается решение.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Подписки на push
--
-- Одна строка на устройство: телефон и ноутбук дают разные endpoint, и слать
-- надо на оба. Ключи хранятся как есть - это не секреты, а адрес доставки,
-- выданный браузером конкретно нашему приложению.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;

create policy push_subs_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subs_insert on public.push_subscriptions
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy push_subs_update on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subs_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Отметки об отправленных напоминаниях
--
-- Без них задача, запускаясь каждый час, слала бы одно и то же напоминание
-- снова и снова, пока человек не поест. Первичный ключ по (кто, день, приём)
-- делает повтор невозможным, а не «маловероятным».
-- ---------------------------------------------------------------------------

create table public.meal_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  sent_at timestamptz not null default now(),
  primary key (user_id, date, meal)
);

alter table public.meal_reminders enable row level security;
revoke all on public.meal_reminders from anon;

create policy meal_reminders_select on public.meal_reminders
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Отправка
-- ---------------------------------------------------------------------------

/** Напоминание конкретному человеку - в отличие от tg_notify_partner. */
create or replace function public.tg_notify_self(target_id uuid, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  chat_id text;
begin
  select decrypted_secret into token
    from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is null then return; end if;

  select telegram_chat_id into chat_id
    from public.profiles where user_id = target_id and telegram_chat_id is not null;
  if chat_id is null then return; end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', chat_id, 'text', message, 'parse_mode', 'HTML'),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception
  when others then
    raise warning 'Telegram: напоминание не отправлено - %', sqlerrm;
end;
$$;

/**
 * Отправка web-push.
 *
 * Сама база подписать VAPID и зашифровать полезную нагрузку не может - это
 * ECDH и AES-GCM, в plpgsql такому не место. Поэтому база только решает
 * «кому и что», а отправку делает функция на Vercel, которую дёргаем через
 * pg_net с общим секретом.
 *
 * Если адрес отправителя не настроен, тихо выходим: Telegram при этом
 * продолжает работать, и напоминания не пропадают целиком.
 */
create or replace function public.push_notify(target_id uuid, title text, body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint_url text;
  shared_secret text;
begin
  select decrypted_secret into endpoint_url
    from vault.decrypted_secrets where name = 'push_endpoint_url' limit 1;
  select decrypted_secret into shared_secret
    from vault.decrypted_secrets where name = 'push_shared_secret' limit 1;

  if endpoint_url is null or shared_secret is null then return; end if;

  perform net.http_post(
    url := endpoint_url,
    body := jsonb_build_object('userId', target_id, 'title', title, 'body', body),
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

/**
 * Обход всех участников и отправка того, что назрело.
 *
 * Задача запускается каждый час, а время сверяется по часовому поясу каждого
 * профиля. Так один и тот же код работает и для Алматы, и для любого другого
 * пояса, и не нужно три отдельных расписания.
 */
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

    label := case target_meal
      when 'breakfast' then 'Позавтракал? Покажи что именно)'
      when 'lunch' then 'Пообедал? Покажи что именно)'
      else 'Поужинал? Покажи что именно)'
    end;

    perform public.tg_notify_self(member.user_id, label);
    perform public.push_notify(member.user_id, 'Love promises', label);

    insert into public.meal_reminders (user_id, date, meal)
    values (member.user_id, local_date, target_meal)
    on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.send_meal_reminders() from public, anon, authenticated;
revoke execute on function public.tg_notify_self(uuid, text) from public, anon, authenticated;
revoke execute on function public.push_notify(uuid, text, text) from public, anon, authenticated;

-- Каждый час в начале часа. Слоты попадают на целые часы, поэтому чаще незачем,
-- а три отдельных расписания не покрыли бы разные часовые пояса.
select cron.schedule('meal-reminders', '0 * * * *', $$ select public.send_meal_reminders() $$);
