-- Огоньки обоих одним запросом.
--
-- checkin_streak считает по одному человеку, и экран, которому нужны оба
-- числа, ходил бы в базу дважды за тем, что всегда нужно вместе, - ровно
-- та же причина, по которой сами отметки берутся одним запросом.
--
-- Считать серию на клиенте было бы третьей копией логики (SQL для вечернего
-- напоминания, SQL для экрана, TS для экрана) - и первая же расходящаяся
-- копия дала бы уверенное неправильное число.

create or replace function public.checkin_streaks(today date)
returns table (user_id uuid, streak int)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, public.checkin_streak(m.user_id, today)
    from public.app_members m
   where public.is_member()
$$;

revoke execute on function public.checkin_streaks(date) from public, anon;
grant execute on function public.checkin_streaks(date) to authenticated;
