-- Рассылка учитывает исключения вхождений.
--
-- Отдельной миграцией, а не дописыванием в предыдущую: та уже применена
-- к живой базе, и дописанное в неё просто не выполнилось бы - db push
-- ответил бы «up to date». Миграции это журнал того, что уже произошло,
-- и править его задним числом нельзя. Я это правило нарушил и увидел
-- ровно описанное: локальная база получила изменение, живая нет.
--
-- Исключения учитываются в обе стороны: отменённое вхождение не уведомляет
-- вовсе, а сдвиг вперёд перескакивает исключённые.

create or replace function public.notify_due_tasks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  task record;
  member record;
  offset_min int;
  message text;
  when_text text;
  next_due timestamptz;
  sent int := 0;
begin
  for task in
    select id, title, due_at, reminders, reminded_offsets, recurrence, recurrence_until,
           excluded_at
      from public.tasks
     where done_at is null
       and due_at is not null
       and array_length(reminders, 1) > 0
       -- Отменённое вхождение молчит: человек его отменил, а не отложил
       and not (due_at = any (coalesce(excluded_at, '{}'::timestamptz[])))
       and exists (
         select 1 from unnest(reminders) as o
          where due_at - (o || ' minutes')::interval <= now()
            and not (o = any (reminded_offsets))
       )
     order by due_at
     limit 100
  loop
    for offset_min in
      select o from unnest(task.reminders) as o
       where task.due_at - (o || ' minutes')::interval <= now()
         and not (o = any (task.reminded_offsets))
       order by o desc
    loop
      -- Отметка ставится до отправки: неотправленное уведомление лучше, чем
      -- приходящее каждые пять минут из-за застрявшей ошибки
      update public.tasks
         set reminded_offsets = array_append(reminded_offsets, offset_min)
       where id = task.id;

      when_text := case
        when offset_min = 0 then 'Срок задачи наступил'
        when offset_min < 60 then 'Через ' || offset_min || ' мин срок задачи'
        when offset_min < 1440 then 'Через ' || (offset_min / 60) || ' ч срок задачи'
        else 'Через ' || (offset_min / 1440) || ' дн срок задачи'
      end;

      message := when_text || E'\n\n' || '<b>' || public.tg_escape(task.title) || '</b>';

      -- Обоим участникам: задача общая, и второй должен знать о сроке,
      -- даже если заводил её не он
      for member in select user_id from public.app_members loop
        perform public.tg_notify_self(member.user_id, message);
        perform public.push_notify(member.user_id, when_text, task.title);
      end loop;

      sent := sent + 1;
    end loop;

    -- Вхождение прошло - сдвигаем повторяющуюся задачу и обнуляем отметки
    if task.recurrence is not null and now() >= task.due_at then
      next_due := public.next_occurrence_allowed(
        task.due_at, task.recurrence, task.excluded_at
      );
      if next_due is not null
         and (task.recurrence_until is null or next_due::date <= task.recurrence_until)
      then
        update public.tasks
           set due_at = next_due, reminded_offsets = '{}'
         where id = task.id;
      else
        -- Повторение кончилось: задача остаётся с последним сроком
        update public.tasks set recurrence = null where id = task.id;
      end if;
    end if;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.notify_due_tasks() from public, anon, authenticated;
