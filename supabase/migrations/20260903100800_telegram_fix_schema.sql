-- Исправление вызова pg_net и диагностика.
--
-- Ошибка: функции pg_net живут в схеме `net`, а не там, куда его установили
-- через `with schema extensions` - расширение всегда создаёт собственную схему.
-- Вызов extensions.http_post падал, а обработчик исключений его проглатывал,
-- поэтому уведомления молча не уходили.
--
-- Отсюда вторая правка: обработчик остаётся (уведомление не повод терять
-- запись), но теперь он поднимает WARNING с текстом ошибки. Молчаливое
-- проглатывание один раз уже спрятало причину.

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
    raise warning 'Telegram: в Vault нет секрета telegram_bot_token';
    return;
  end if;

  select p.telegram_chat_id into chat_id
    from public.profiles p
    join public.app_members m on m.user_id = p.user_id
   where p.user_id <> author_id
     and p.telegram_chat_id is not null
   limit 1;

  if chat_id is null then
    return; -- уведомления не настроены, это нормальное состояние
  end if;

  perform net.http_post(
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
    -- Запись важнее уведомления, поэтому не падаем. Но и не молчим.
    raise warning 'Telegram: уведомление не отправлено - %', sqlerrm;
    return;
end;
$$;

revoke execute on function public.tg_notify_partner(uuid, text) from public, anon, authenticated;

/**
 * Та же отправка, но без проглатывания ошибок и с явным адресатом.
 * Только для scripts/check-telegram.ts: в проверке нужно видеть причину,
 * а не «что-то не сработало».
 */
create or replace function public.tg_send_raw(chat_id text, message text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token
    from vault.decrypted_secrets
   where name = 'telegram_bot_token'
   limit 1;

  if token is null then
    raise exception 'В Vault нет секрета telegram_bot_token';
  end if;

  return net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', chat_id,
      'text', message,
      'parse_mode', 'HTML'
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke execute on function public.tg_send_raw(text, text) from public, anon, authenticated;
