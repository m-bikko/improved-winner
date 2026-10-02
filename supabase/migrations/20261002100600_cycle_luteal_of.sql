-- Длина лютеиновой фазы - владелицы цикла, а не того, кто смотрит.
--
-- Найдено при проверке «Готовимся к малышу» с двух сторон: у Аминош
-- лютеиновая фаза 16 дней, у Бикоша в настройках - значение по умолчанию 14.
-- Прогноз её цикла на телефоне Бикоша (раздел цикла, плитка главной,
-- благоприятное окно) считался с ЕГО 14 днями и расходился с её прогнозом
-- на два дня. Партнёр просто не мог прочитать её настройки: политика
-- cycle_settings отдаёт только свою строку, и клиент молча брал свои.
--
-- Отдавать партнёру всю строку настроек незачем - ему нужна одна цифра,
-- и только когда цикл ему открыт. Та же граница, что у cycle_shared_with_me.

create or replace function public.cycle_luteal_of(owner uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select s.luteal_days
    from public.cycle_settings s
   where s.user_id = owner
     and public.is_member()
     and (owner = (select auth.uid()) or public.cycle_shared_with_me(owner))
$$;

revoke execute on function public.cycle_luteal_of(uuid) from public, anon;
grant execute on function public.cycle_luteal_of(uuid) to authenticated;
