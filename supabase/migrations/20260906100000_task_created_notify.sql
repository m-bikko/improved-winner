-- Уведомление о созданной задаче - обоим, независимо от автора.
--
-- До сих пор задача давала о себе знать только когда наступал срок. Между
-- «завёл» и «пора» могли пройти дни, и второй человек всё это время о задаче
-- не знал, хотя список общий. Смысл общего списка в том и был, чтобы не
-- пересказывать друг другу.
--
-- Обоим, включая автора. Это отличается от тем, где уведомление уходит только
-- партнёру, и отличие не случайно: тема - разговор, и сообщать человеку о его
-- же реплике незачем. Задача - обязательство, и подтверждение, что оно
-- записано и ушло второму, полезно самому автору. Та же логика, по которой
-- обоим приходит и наступивший срок.

create or replace function public.tg_on_task_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  author text;
  due_line text;
  message text;
begin
  select nickname into author from public.profiles where user_id = new.created_by;

  -- Срок в сообщении в поясе профиля автора, а не в UTC: «до 4 сентября,
  -- 10:00» должно означать то же, что человек видел в форме.
  due_line := case
    when new.due_at is null then ''
    else E'\n' || to_char(
      new.due_at at time zone coalesce(
        (select timezone from public.profiles where user_id = new.created_by),
        'Asia/Almaty'
      ),
      'DD.MM в HH24:MI'
    )
  end;

  message := coalesce(author, 'Партнёр') || ' поставил задачу' || E'\n\n'
             || '<b>' || public.tg_escape(new.title) || '</b>'
             || case when new.notes is null or btrim(new.notes) = '' then ''
                     else E'\n' || public.tg_escape(new.notes) end
             || due_line;

  for member in select user_id from public.app_members loop
    perform public.tg_notify_self(member.user_id, message);
    perform public.push_notify(member.user_id, 'Новая задача', new.title);
  end loop;

  return new;
end;
$$;

revoke execute on function public.tg_on_task_insert() from public, anon, authenticated;

create trigger tasks_tg_insert after insert on public.tasks
  for each row execute function public.tg_on_task_insert();
