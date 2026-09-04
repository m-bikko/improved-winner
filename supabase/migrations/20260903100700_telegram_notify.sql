-- Уведомления в Telegram о событиях в темах.
--
-- Отправка живёт в базе, а не в клиенте: токен бота нельзя отдавать в браузер,
-- а Edge Function для этого проекта задеплоить нечем - Management API доступен
-- под другим аккаунтом. Триггер плюс pg_net закрывает задачу тем, что уже есть.
--
-- Токен лежит в Vault и в репозиторий не попадает: его кладёт туда отдельный
-- скрипт scripts/set-telegram-secret.ts, читая .env.
--
-- Главное свойство: уведомление НИКОГДА не должно ронять запись. Человек
-- написал комментарий - комментарий обязан сохраниться, даже если Telegram
-- недоступен, токен протух, а chat id не задан. Поэтому вся отправка обёрнута
-- в обработчик исключений, а pg_net и так работает асинхронно и не ждёт ответа.

create extension if not exists pg_net with schema extensions;

alter table public.profiles
  add column telegram_chat_id text
    check (telegram_chat_id is null or telegram_chat_id ~ '^-?\d{1,20}$');

comment on column public.profiles.telegram_chat_id is
  'Chat id в Telegram. Узнаётся у @userinfobot. Пусто - уведомления не шлём.';

-- Экранирование под parse_mode=HTML. Без него заголовок темы со знаком «<»
-- уронил бы разбор сообщения на стороне Telegram.
create or replace function public.tg_escape(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(coalesce(input, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

/**
 * Отправляет сообщение партнёру автора события.
 *
 * Именно партнёру: получать пуш о собственном комментарии - верный способ
 * отключить уведомления в первый же день.
 */
create or replace function public.tg_notify_partner(author_id uuid, message text)
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
    from vault.decrypted_secrets
   where name = 'telegram_bot_token'
   limit 1;

  if token is null then
    return;
  end if;

  -- Партнёр - это второй участник. Их ровно двое, поэтому «не автор» однозначно.
  select p.telegram_chat_id into chat_id
    from public.profiles p
    join public.app_members m on m.user_id = p.user_id
   where p.user_id <> author_id
     and p.telegram_chat_id is not null
   limit 1;

  if chat_id is null then
    return;
  end if;

  perform extensions.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', chat_id,
      'text', message,
      'parse_mode', 'HTML',
      'disable_web_page_preview', true
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- Уведомление не повод терять запись. Молча пропускаем.
    return;
end;
$$;

revoke execute on function public.tg_notify_partner(uuid, text) from public, anon, authenticated;

/** Новая тема. */
create or replace function public.tg_on_topic_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
begin
  select nickname into author from public.profiles where user_id = new.created_by;

  perform public.tg_notify_partner(
    new.created_by,
    coalesce(author, 'Партнёр') || ' завёл тему' || E'\n\n'
      || '<b>' || public.tg_escape(new.title) || '</b>'
      || case
           when new.body is null or btrim(new.body) = '' then ''
           else E'\n\n' || public.tg_escape(left(new.body, 600))
         end
  );
  return new;
end;
$$;

/** Комментарий. */
create or replace function public.tg_on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  topic_title text;
begin
  select nickname into author from public.profiles where user_id = new.author_id;
  select title into topic_title from public.topics where id = new.topic_id;

  perform public.tg_notify_partner(
    new.author_id,
    coalesce(author, 'Партнёр') || ' ответил в теме «'
      || public.tg_escape(coalesce(topic_title, '')) || '»' || E'\n\n'
      || public.tg_escape(left(new.body, 600))
  );
  return new;
end;
$$;

/**
 * Закрытие темы.
 *
 * Только переход open → closed. Без этого условия любая правка закрытой темы
 * слала бы уведомление заново.
 */
create or replace function public.tg_on_topic_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
begin
  select nickname into author from public.profiles where user_id = new.closed_by;

  perform public.tg_notify_partner(
    coalesce(new.closed_by, new.created_by),
    coalesce(author, 'Партнёр') || ' закрыл тему «'
      || public.tg_escape(new.title) || '»' || E'\n\n'
      || 'Как решили: ' || public.tg_escape(left(coalesce(new.resolution, ''), 600))
  );
  return new;
end;
$$;

create trigger topics_tg_insert after insert on public.topics
  for each row execute function public.tg_on_topic_insert();

create trigger topics_tg_closed after update on public.topics
  for each row
  when (old.status = 'open' and new.status = 'closed')
  execute function public.tg_on_topic_closed();

create trigger topic_comments_tg_insert after insert on public.topic_comments
  for each row execute function public.tg_on_comment_insert();
