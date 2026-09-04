-- Заголовок push-уведомления о еде: приём пищи вместо названия приложения.
--
-- Название приложения в заголовке было бесполезной строкой: систему и так
-- видно - iOS и Android подписывают уведомление именем установленного PWA.
-- Место в заголовке уходило на то, что читатель уже знает, а сам приём пищи
-- оставался только в теле.
--
-- Вторая причина: название теперь настраивается сборкой
-- (VITE_PUBLIC_APP_NAME), а в базе оно было вписано намертво - стоило
-- переименовать приложение, и уведомления продолжали бы звать его по-старому.
-- Правильное решение здесь не «прокинуть имя в базу», а вовсе не хранить его
-- там: у остальных рассылок в заголовке стоит вид события («Срок задачи»,
-- «за час»), и это единственное место, которое выбивалось.

create or replace function public.send_meal_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  local_now timestamp;
  local_date date;
  local_hour int;
  target_meal text;
  meal_title text;
  label text;
  sent int := 0;
begin
  for member in
    select p.user_id, p.nickname, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone member.tz;
    local_date := local_now::date;
    local_hour := extract(hour from local_now)::int;

    target_meal := case local_hour
      when 11 then 'breakfast'
      when 14 then 'lunch'
      when 21 then 'dinner'
      else null
    end;

    if target_meal is null then
      continue;
    end if;

    -- Уже поел - напоминать не о чем
    if exists (
      select 1 from public.diary_entries e
       where e.user_id = member.user_id and e.date = local_date and e.meal = target_meal
    ) then
      continue;
    end if;

    -- Уже напоминали сегодня об этом приёме
    if exists (
      select 1 from public.meal_reminders r
       where r.user_id = member.user_id and r.date = local_date and r.meal = target_meal
    ) then
      continue;
    end if;

    meal_title := case target_meal
      when 'breakfast' then 'Завтрак'
      when 'lunch' then 'Обед'
      else 'Ужин'
    end;

    label := case target_meal
      when 'breakfast' then 'Позавтракал? Покажи что именно)'
      when 'lunch' then 'Пообедал? Покажи что именно)'
      else 'Поужинал? Покажи что именно)'
    end;

    perform public.tg_notify_self(member.user_id, label);
    perform public.push_notify(member.user_id, meal_title, label);

    insert into public.meal_reminders (user_id, date, meal)
    values (member.user_id, local_date, target_meal)
    on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.send_meal_reminders() from public, anon, authenticated;
