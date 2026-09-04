-- Напоминания о еде: род по полу из профиля.
--
-- Текст был один на всех и в мужском роде: «Позавтракал? Покажи что именно)».
-- Аминош получала его каждый раз, хотя в её профиле `sex = 'female'` стоит
-- с самого начала и функция уже читала эту строку — просто не смотрела в неё.
--
-- Скобочная форма «Позавтракал(а)?» здесь была бы не решением, а отказом
-- от него: приложение знает пол, и подставить правильное слово ему ничего
-- не стоит. Скобки нужны там, где пол неизвестен, — и ровно там они и стоят.
--
-- `sex` необязателен (в CHECK только 'male'/'female', но колонка nullable),
-- поэтому третья ветка обязана существовать. Для неё взята форма без рода
-- вообще: «Завтрак был?» — она не выглядит компромиссом, в отличие от «(а)».

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
    select p.user_id, p.nickname, p.sex, coalesce(p.timezone, 'Asia/Almaty') as tz
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

    -- Уже поел — напоминать не о чем
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

    label := case
      when member.sex = 'female' then
        case target_meal
          when 'breakfast' then 'Позавтракала? Покажи что именно)'
          when 'lunch' then 'Пообедала? Покажи что именно)'
          else 'Поужинала? Покажи что именно)'
        end
      when member.sex = 'male' then
        case target_meal
          when 'breakfast' then 'Позавтракал? Покажи что именно)'
          when 'lunch' then 'Пообедал? Покажи что именно)'
          else 'Поужинал? Покажи что именно)'
        end
      else
        -- Пол не указан: обходимся без рода вовсе
        case target_meal
          when 'breakfast' then 'Завтрак был? Покажи что именно)'
          when 'lunch' then 'Обед был? Покажи что именно)'
          else 'Ужин был? Покажи что именно)'
        end
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
