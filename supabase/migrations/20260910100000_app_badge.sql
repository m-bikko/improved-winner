-- Число на иконке приложения.
--
-- Виджета из PWA на iOS не сделать - WidgetKit живёт только в нативных
-- приложениях. Но половину смысла виджета закрывает бейдж: посмотреть,
-- не открывая.
--
-- Число должно означать ровно одно и само исчезать, иначе его перестанут
-- замечать. Здесь это «сколько требует ТЕБЯ»: неотмеченное самочувствие
-- плюс просроченные задачи. И то и другое закрывается действием, после
-- которого бейдж гаснет сам.
--
-- Сознательно НЕ входит: непрочитанные ответы в темах и события вишлиста.
-- Они требуют внимания, но не действия, и висели бы на иконке, пока
-- не откроешь, - то есть превратили бы бейдж в «в приложении что-то есть»,
-- а такое число не читают вовсе.

create or replace function public.attention_count(target uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (
    select coalesce(p.timezone, 'Asia/Almaty') as name
      from public.profiles p where p.user_id = target
  ),
  local_now as (select now() at time zone (select name from tz) as ts)
  select
    -- Самочувствие. Считаем только после часа, когда о нём спрашивают:
    -- бейдж в 00:05 с требованием отметиться - это не напоминание,
    -- а придирка
    (select case
       when extract(hour from (select ts from local_now))::int < 11 then 0
       when exists (
         select 1 from public.checkins c
          where c.user_id = target and c.date = (select ts from local_now)::date
       ) then 0
       else 1
     end)
    +
    -- Просроченные задачи. Повторяющиеся не в счёт: у них due_at двигает
    -- планировщик, и «просрочено» для них - состояние на пять минут
    -- до ближайшего запуска рассылки
    (select count(*)::int from public.tasks t
      where t.done_at is null
        and t.recurrence is null
        and t.due_at is not null
        and t.due_at < now())
$$;

revoke execute on function public.attention_count(uuid) from public, anon;
grant execute on function public.attention_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Бейдж едет вместе с push: так он живой и при закрытом приложении.
--
-- Считает база, а не обработчик на Vercel: тому пришлось бы ходить за теми же
-- данными вторым запросом, зная про чек-ины и повторение задач. Знание о том,
-- что такое «требует тебя», должно лежать в одном месте.

create or replace function public.push_notify(
  target_id uuid,
  title text,
  body text,
  kind text,
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
  if not public.notify_allowed(target_id, kind, 'push') then return; end if;

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
      'url', url,
      'badge', public.attention_count(target_id)
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

revoke execute on function public.push_notify(uuid, text, text, text, text)
  from public, anon, authenticated;
