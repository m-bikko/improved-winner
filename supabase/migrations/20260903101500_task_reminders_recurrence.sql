-- Настраиваемые напоминания и повторяемость задач.
--
-- Три решения, которые определяют всё остальное:
--
-- 1. Напоминания - массив смещений в минутах до срока. Не отдельная таблица:
--    их единицы на задачу, они всегда читаются и пишутся вместе с ней,
--    и join ради трёх чисел ничего не даёт.
--
-- 2. Повторяемость - правило, а не материализованные вхождения. Одна строка
--    на задачу, а срок сдвигается вперёд после того, как вхождение прошло.
--    Генерация строк вперёд означала бы «на сколько лет вперёд?» и чистку
--    хвостов при любой правке правила.
--
-- 3. Отметки об отправленных напоминаниях сбрасываются при переходе
--    к следующему вхождению. Иначе повторяющаяся задача напомнила бы о себе
--    ровно один раз в жизни.

alter table public.tasks
  -- Смещения в минутах до срока: 0 - в момент дедлайна, 60 - за час,
  -- 1440 - за сутки. Пустой массив - не напоминать вовсе.
  add column reminders int[] not null default '{0}',

  -- Какие смещения текущего вхождения уже отправлены
  add column reminded_offsets int[] not null default '{}',

  -- {"freq":"daily|weekly|monthly|yearly","interval":N,"weekdays":[1..7]}
  -- null - не повторяется
  add column recurrence jsonb,

  -- Последний день, когда повторение ещё уместно. null - без конца
  add column recurrence_until date;

-- Допустимые смещения перечислены явно: набор фиксирован интерфейсом,
-- и <@ проверяет вложенность массива одним выражением, без подзапросов,
-- которые в CHECK всё равно недопустимы
alter table public.tasks
  add constraint tasks_reminders_sane check (
    reminders <@ array[0, 5, 10, 15, 30, 60, 120, 180, 720, 1440, 2880, 10080]
  );

alter table public.tasks
  add constraint tasks_recurrence_shape check (
    recurrence is null
    or (
      recurrence ->> 'freq' in ('daily', 'weekly', 'monthly', 'yearly')
      and (recurrence -> 'interval') is not null
      and (recurrence ->> 'interval')::int between 1 and 99
    )
  );

-- Повторение без срока бессмысленно: нечего сдвигать
alter table public.tasks
  add constraint tasks_recurrence_needs_due check (recurrence is null or due_at is not null);

comment on column public.tasks.reminders is
  'Смещения в минутах до срока. 0 - в момент дедлайна.';
comment on column public.tasks.reminded_offsets is
  'Отправленные смещения текущего вхождения. Сбрасывается при переходе к следующему.';

/**
 * Следующее вхождение после указанного момента.
 *
 * Та же логика повторена в src/features/tasks/recurrence.ts - там она нужна,
 * чтобы раскрыть правило на видимый месяц календаря, когда в базе лежит только
 * ближайший срок. Дублирование осознанное, и оно сверяется проверкой
 * scripts/check-recurrence.ts: расхождение здесь означало бы, что календарь
 * показывает одни даты, а уведомления приходят в другие.
 */
create or replace function public.next_occurrence(from_ts timestamptz, rule jsonb)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  freq text := rule ->> 'freq';
  step int := coalesce((rule ->> 'interval')::int, 1);
  weekdays int[];
  candidate timestamptz;
  guard int := 0;
begin
  if rule is null then
    return null;
  end if;

  if freq = 'weekly' then
    select array_agg(value::int) into weekdays
      from jsonb_array_elements_text(coalesce(rule -> 'weekdays', '[]'::jsonb));
  end if;

  -- Недельное правило с выбранными днями идёт по дням, а не по неделям:
  -- «пн, ср, пт» это три вхождения в неделю, а не одно
  if freq = 'weekly' and weekdays is not null and array_length(weekdays, 1) > 0 then
    candidate := from_ts;
    loop
      candidate := candidate + interval '1 day';
      guard := guard + 1;
      -- isodow: понедельник 1, воскресенье 7
      if extract(isodow from candidate)::int = any (weekdays) then
        return candidate;
      end if;
      exit when guard > 370;
    end loop;
    return null;
  end if;

  return case freq
    -- Postgres сам подрезает конец месяца: 31 января + 1 месяц = 28 февраля
    when 'daily' then from_ts + (step || ' days')::interval
    when 'weekly' then from_ts + (step || ' weeks')::interval
    when 'monthly' then from_ts + (step || ' months')::interval
    when 'yearly' then from_ts + (step || ' years')::interval
  end;
end;
$$;

/**
 * Рассылка напоминаний и сдвиг повторяющихся задач.
 *
 * Порядок внутри одной задачи важен: сначала отправляем всё, чему пришло время,
 * и только потом сдвигаем срок. При обратном порядке напоминание «в момент
 * дедлайна» никогда бы не отправилось у повторяющейся задачи - срок уезжал бы
 * вперёд раньше, чем до него дойдёт очередь.
 */
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
    select id, title, due_at, reminders, reminded_offsets, recurrence, recurrence_until
      from public.tasks
     where done_at is null
       and due_at is not null
       and array_length(reminders, 1) > 0
       -- Хотя бы одно напоминание уже пора отправить
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
      next_due := public.next_occurrence(task.due_at, task.recurrence);
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
revoke execute on function public.next_occurrence(timestamptz, jsonb) from public, anon;
grant execute on function public.next_occurrence(timestamptz, jsonb) to authenticated;
