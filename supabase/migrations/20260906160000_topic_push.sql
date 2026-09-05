-- Уведомления по темам теперь идут и push'ом, а не только в телеграм.
--
-- Так сложилось исторически: темы делались первыми, когда push в проекте
-- ещё не было, а когда он появился - его подключили к еде и задачам,
-- а темы остались как были. Разницы по смыслу тут нет: новая тема или ответ
-- партнёра - это ровно то, о чём стоит узнать сразу, а не когда откроешь
-- телеграм.
--
-- Адресат не меняется: партнёру автора. Тема это разговор, и сообщать
-- человеку о его же реплике незачем.
--
-- Общий помощник, чтобы «кто партнёр» не считалось в трёх местах по-разному.

create or replace function public.partner_of(author_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.app_members m
   where m.user_id is distinct from author_id
   limit 1
$$;

revoke execute on function public.partner_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.tg_on_topic_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  target uuid;
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

  target := public.partner_of(new.created_by);
  if target is not null then
    perform public.push_notify(target, 'Новая тема', new.title);
  end if;

  return new;
end;
$$;

create or replace function public.tg_on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  topic_title text;
  target uuid;
begin
  select nickname into author from public.profiles where user_id = new.author_id;
  select title into topic_title from public.topics where id = new.topic_id;

  perform public.tg_notify_partner(
    new.author_id,
    coalesce(author, 'Партнёр') || ' ответил в теме «'
      || public.tg_escape(coalesce(topic_title, '')) || '»' || E'\n\n'
      || public.tg_escape(left(new.body, 600))
  );

  target := public.partner_of(new.author_id);
  if target is not null then
    -- В заголовке тема, в теле сам ответ: так из шторки видно, о чём речь,
    -- без открытия приложения
    perform public.push_notify(
      target,
      'Ответ: ' || coalesce(topic_title, 'тема'),
      left(new.body, 200)
    );
  end if;

  return new;
end;
$$;

create or replace function public.tg_on_topic_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  target uuid;
begin
  select nickname into author from public.profiles where user_id = new.closed_by;

  perform public.tg_notify_partner(
    coalesce(new.closed_by, new.created_by),
    coalesce(author, 'Партнёр') || ' закрыл тему «'
      || public.tg_escape(new.title) || '»' || E'\n\n'
      || 'Как решили: ' || public.tg_escape(left(coalesce(new.resolution, ''), 600))
  );

  target := public.partner_of(coalesce(new.closed_by, new.created_by));
  if target is not null then
    perform public.push_notify(
      target,
      'Тема закрыта: ' || new.title,
      left(coalesce(new.resolution, ''), 200)
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_on_topic_insert() from public, anon, authenticated;
revoke execute on function public.tg_on_comment_insert() from public, anon, authenticated;
revoke execute on function public.tg_on_topic_closed() from public, anon, authenticated;
