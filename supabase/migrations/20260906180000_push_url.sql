-- push_notify научился адресу: тап по уведомлению открывает нужный раздел.
--
-- Обработчик в public/push-sw.js и api/push.ts поле `url` читают с самого
-- начала, но база его никогда не присылала - и всё, включая уведомления
-- о задачах и темах, открывало дневник. Пока в уведомлении лежал сам текст,
-- это было полбеды. Теперь смысл уведомления - «посмотри в приложении»,
-- и высадка не на том экране превращает его в издевательство.
--
-- Старую трёхаргументную версию удаляем, а не оставляем рядом: с параметром
-- по умолчанию два варианта дали бы неоднозначность при вызове с тремя
-- аргументами. Тела plpgsql имён не резолвят на этапе создания, поэтому
-- существующие вызовы с тремя аргументами продолжат работать - и попадут
-- в новую функцию со значением по умолчанию.

drop function if exists public.push_notify(uuid, text, text);

create or replace function public.push_notify(
  target_id uuid,
  title text,
  body text,
  url text default null
)
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
    body := jsonb_strip_nulls(jsonb_build_object(
      'userId', target_id,
      'title', title,
      'body', body,
      'url', url
    )),
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

revoke execute on function public.push_notify(uuid, text, text, text)
  from public, anon, authenticated;
