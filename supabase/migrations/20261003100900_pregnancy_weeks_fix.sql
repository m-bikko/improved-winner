-- Еженедельная рассылка беременности падала.
--
-- Переменная week в send_pregnancy_weeks совпадала с колонкой week таблицы
-- pregnancy_notices, и Postgres отвергал запрос: «column reference "week" is
-- ambiguous». Задание cron падало бы каждый час, пока идёт беременность, -
-- ни одного уведомления о новой неделе. Поймала проверка check-pregnancy
-- до того, как режим включили по-настоящему. Переменная переименована.

CREATE OR REPLACE FUNCTION public.send_pregnancy_weeks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  g record;
  person record;
  local_now timestamp;
  today date;
  days int;
  week_n int;
  sent int := 0;
begin
  select * into g from public.pregnancy where ended_on is null;
  if not found then
    return 0;
  end if;

  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;
    if extract(hour from local_now)::int <> 10 then
      continue;
    end if;
    days := today - g.lmp;
    -- Только в первый день недели и только в пределах срока
    if days % 7 <> 0 then
      continue;
    end if;
    week_n := days / 7;
    if week_n < 4 or week_n > 42 then
      continue;
    end if;
    if exists (
      select 1 from public.pregnancy_notices n
       where n.user_id = person.user_id and n.lmp = g.lmp and n.week = week_n
    ) then
      continue;
    end if;
    insert into public.pregnancy_notices (user_id, week, lmp) values (person.user_id, week_n, g.lmp)
    on conflict do nothing;

    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tg_escape(public.tx(person.user_id, 'n.preg.week', week_n::text)) || '</b>'
        || E'\n\n' || public.tg_escape(public.tx(person.user_id, 'n.preg.weekBody',
             public.tx(person.user_id, 'n.preg.size.' || least(week_n, 40)::text))),
      'pregnancy');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.preg.week', week_n::text),
      public.tx(person.user_id, 'n.preg.weekBody',
        public.tx(person.user_id, 'n.preg.size.' || least(week_n, 40)::text)),
      'pregnancy',
      '/pregnancy');
    sent := sent + 1;
  end loop;
  return sent;
end;
$function$;
