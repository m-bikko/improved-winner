-- Отправка напоминания о любви в 18:00 по поясу профиля.
--
-- Обоим, каждый день, свой текст на каждую дату. {partner} подставляется
-- именем ВТОРОГО человека: Аминош получает сообщение про Бикоша и наоборот.
--
-- Час проверяется по местному времени профиля, как у остальных рассылок:
-- задание идёт каждый час, и одного расписания хватает на любые пояса.
--
-- Дедупликация по (user_id, on_date): задание срабатывает двенадцать раз
-- в сутки в нужный час по разным поясам, и без отметки человек получил бы
-- одно и то же сообщение столько же раз.

create or replace function public.send_love_notes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  partner_nick text;
  note text;
  today date;
  local_now timestamp;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 18 then
      continue;
    end if;

    if exists (
      select 1 from public.love_notes_sent s
       where s.user_id = person.user_id and s.on_date = today
    ) then
      continue;
    end if;

    select n.message into note from public.love_notes n where n.on_date = today;
    -- Даты кончились - молчим. Слать по кругу значило бы нарушить
    -- то самое условие, ради которого тексты и писались по одному.
    if note is null then
      continue;
    end if;

    select p2.nickname into partner_nick
      from public.profiles p2
      join public.app_members m2 on m2.user_id = p2.user_id
     where p2.user_id <> person.user_id
     limit 1;

    note := replace(note, '{partner}', coalesce(partner_nick, 'Твой партнёр'));

    perform public.tg_notify_self(person.user_id, note);
    perform public.push_notify(person.user_id, 'Помни', note);

    insert into public.love_notes_sent (user_id, on_date)
    values (person.user_id, today) on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.send_love_notes() from public, anon, authenticated;

select cron.schedule('love-notes', '0 * * * *', $$ select public.send_love_notes() $$);
