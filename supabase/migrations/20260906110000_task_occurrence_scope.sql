-- Правка одного вхождения повторяющейся задачи.
--
-- До сих пор задача была одной строкой с правилом повторения, и любая правка
-- меняла всё сразу: и прошедшее, и будущее. Перенести одну тренировку было
-- нельзя - переносились все.
--
-- Реализовано так же, как в календарях: без материализации вхождений.
--
--   «Только это»      - вхождение попадает в excluded_at исходной задачи,
--                       и рядом заводится обычная разовая задача.
--   «Это и дальнейшие» - у исходной задачи ставится recurrence_until на день
--                       перед вхождением, а новая задача продолжает правило
--                       с новыми полями.
--
-- Исключения хранятся МОМЕНТАМИ, а не датами. Дата потребовала бы решать,
-- в чьём часовом поясе она считается: у базы UTC, у людей Алматы, и вхождение
-- в 01:00 попадало бы во вчера. Момент сравнивается точно и пояса не знает.

alter table public.tasks
  add column excluded_at timestamptz[] not null default '{}';

comment on column public.tasks.excluded_at is
  'Вхождения повторения, которые отменены или заменены отдельной задачей. '
  'Пропускаются и при рассылке, и в календаре.';

-- ---------------------------------------------------------------------------
-- Следующее вхождение с учётом исключений.
--
-- Отдельной функцией, а не правкой next_occurrence: та описывает ПРАВИЛО
-- и обязана оставаться immutable и ничего не знать про конкретную задачу.
-- Исключения - свойство задачи, и место им здесь.

create or replace function public.next_occurrence_allowed(
  from_ts timestamptz,
  rule jsonb,
  excluded timestamptz[]
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate timestamptz := from_ts;
  guard int := 0;
begin
  loop
    candidate := public.next_occurrence(candidate, rule);
    exit when candidate is null;
    if not (candidate = any (coalesce(excluded, '{}'::timestamptz[]))) then
      return candidate;
    end if;
    guard := guard + 1;
    -- Защита от правила, у которого все ближайшие вхождения исключены.
    -- Без неё отменённая на год вперёд задача повесила бы рассылку.
    exit when guard > 400;
  end loop;
  return null;
end;
$$;

revoke execute on function public.next_occurrence_allowed(timestamptz, jsonb, timestamptz[])
  from public, anon;
grant execute on function public.next_occurrence_allowed(timestamptz, jsonb, timestamptz[])
  to authenticated;
