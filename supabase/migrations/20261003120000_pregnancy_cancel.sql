-- Отмена режима беременности.
--
-- «Завершить режим» ставит дату конца и оставляет всё как было: срок,
-- визиты, шевеления, строку в «Нашей истории». Это для беременности,
-- которая была. Если же режим включили по ошибке или «посмотреть», нужен
-- другой исход - как будто его не включали: строки нет, визитов и сессий
-- шевелений нет, отметок еженедельных уведомлений нет, цикл снова считает
-- прогноз и шлёт рассылки.
--
-- Одной функцией, а не тремя удалениями из клиента: удаление сессий
-- шевелений по RLS разрешено только их автору, и отмена от второго
-- оставила бы чужие сессии. И всё или ничего - транзакцией.

create or replace function public.cancel_pregnancy()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'cancel_pregnancy: только для участников' using errcode = '42501';
  end if;
  -- where true: на случай safeupdate, который запрещает DELETE без условия
  delete from public.kick_sessions where true;
  delete from public.pregnancy_visits where true;
  delete from public.pregnancy_notices where true;
  delete from public.pregnancy where true;
end;
$$;

revoke execute on function public.cancel_pregnancy() from public, anon;
grant execute on function public.cancel_pregnancy() to authenticated;
