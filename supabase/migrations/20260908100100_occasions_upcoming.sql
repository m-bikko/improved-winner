-- Список дат сразу с ответом на вопрос «сколько осталось».
--
-- Считать это на клиенте значило бы завести вторую копию календарной
-- арифметики - той самой, которая спотыкается на 29 февраля. Копия уже есть
-- у повторяющихся задач и у фаз цикла, и обе прикрыты проверками на согласие
-- с SQL. Здесь дублировать нечего: экрану нужны только число дней и
-- ближайшая дата, и то и другое база отдаёт сама.

create or replace function public.occasions_upcoming(today date)
returns table (
  id uuid,
  title text,
  date date,
  kind text,
  yearly boolean,
  note text,
  created_by uuid,
  next_on date,
  days int,
  years int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.title, o.date, o.kind, o.yearly, o.note, o.created_by,
         public.occasion_next(o.date, o.yearly, today) as next_on,
         (public.occasion_next(o.date, o.yearly, today) - today)::int as days,
         -- Которая это годовщина. Ноль означает «считать нечего»:
         -- дата в будущем или отмечается однократно
         greatest(0, extract(year from public.occasion_next(o.date, o.yearly, today))::int
                     - extract(year from o.date)::int)::int as years
    from public.occasions o
   order by 9, o.title
$$;

revoke execute on function public.occasions_upcoming(date) from public, anon;
grant execute on function public.occasions_upcoming(date) to authenticated;
