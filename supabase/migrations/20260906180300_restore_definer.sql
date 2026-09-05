-- restore_checkin_day должна быть security definer.
--
-- Функция была invoker, а таблица checkin_restores намеренно закрыта для
-- authenticated на запись - чтобы день нельзя было восстановить прямым
-- insert'ом в обход окна и лимита. В сумме это дало функцию, которая
-- отваливалась на permission denied: она проверяла всё правильно и не могла
-- записать результат.
--
-- Права остаются закрытыми, а функция получает право писать сама. Проверки
-- внутри - членство, окно в неделю, отсутствие отметки, свободный слот -
-- и есть тот единственный вход, ради которого таблица закрыта.

create or replace function public.restore_checkin_day(target_date date, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  free_slot smallint;
begin
  if me is null or not public.is_member() then
    raise exception 'Нет доступа';
  end if;

  if target_date >= today then
    raise exception 'Восстанавливать можно только прошедший день';
  end if;

  if target_date < today - 7 then
    raise exception 'Слишком давно: восстановить можно день за последнюю неделю';
  end if;

  if exists (select 1 from public.checkins c where c.user_id = me and c.date = target_date) then
    raise exception 'В этот день отметка уже есть';
  end if;

  select s into free_slot
    from generate_series(1, 2) s
   where not exists (
     select 1 from public.checkin_restores r
      where r.user_id = me
        and r.month = date_trunc('month', target_date::timestamp)::date
        and r.slot = s)
   order by s
   limit 1;

  if free_slot is null then
    raise exception 'Восстановления на этот месяц кончились';
  end if;

  insert into public.checkin_restores (user_id, date, slot)
  values (me, target_date, free_slot);
end;
$$;

revoke execute on function public.restore_checkin_day(date, date) from public, anon;
grant execute on function public.restore_checkin_day(date, date) to authenticated;
