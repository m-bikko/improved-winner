-- Уведомления об удалении задачи и темы.
--
-- Пропажа из общего списка - событие того же порядка, что и появление.
-- Второй человек видел задачу вчера, сегодня её нет, и без уведомления
-- это выглядит так, будто она сама исчезла. Для списка на двоих это хуже,
-- чем лишнее сообщение.
--
-- Адресаты сохраняют логику своих разделов, а не выравниваются между собой:
--   задача - ОБОИМ, включая удалившего: она общая, и подтверждение,
--            что запись убрана у обоих, полезно и автору действия;
--   тема   - ПАРТНЁРУ удалившего: тема это разговор, и сообщать человеку
--            о его же действии в разговоре незачем.
--
-- Триггеры before delete, а не after: after delete у строки ещё есть OLD,
-- но если удаление откатится, уведомление уже уйдёт. Здесь это не так важно
-- (откатов нет), но правило одно - сообщать о том, что случилось.
-- Поэтому after.

create or replace function public.tg_on_task_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  who text;
  message text;
begin
  select nickname into who from public.profiles where user_id = (select auth.uid());

  message := coalesce(who, 'Партнёр') || ' удалил задачу' || E'\n\n'
             || '<b>' || public.tg_escape(old.title) || '</b>';

  for member in select user_id from public.app_members loop
    perform public.tg_notify_self(member.user_id, message);
    perform public.push_notify(member.user_id, 'Задача удалена', old.title);
  end loop;

  return old;
end;
$$;

revoke execute on function public.tg_on_task_delete() from public, anon, authenticated;

create trigger tasks_tg_delete after delete on public.tasks
  for each row execute function public.tg_on_task_delete();

-- ---------------------------------------------------------------------------

create or replace function public.tg_on_topic_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  message text;
  partner_id uuid;
begin
  select nickname into who from public.profiles where user_id = old.created_by;

  message := coalesce(who, 'Партнёр') || ' удалил тему' || E'\n\n'
             || '<b>' || public.tg_escape(old.title) || '</b>';

  perform public.tg_notify_partner(old.created_by, message);

  -- push уходит тому же адресату, что и телеграм: партнёру автора
  select m.user_id into partner_id
    from public.app_members m where m.user_id <> old.created_by limit 1;
  if partner_id is not null then
    perform public.push_notify(partner_id, 'Тема удалена', old.title);
  end if;

  return old;
end;
$$;

revoke execute on function public.tg_on_topic_delete() from public, anon, authenticated;

create trigger topics_tg_delete after delete on public.topics
  for each row execute function public.tg_on_topic_delete();
