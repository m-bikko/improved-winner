-- Сводка недели: момент рассылки - параметром.
--
-- Рассылка уходит только в воскресенье в 20:00, и проверить её можно было
-- раз в неделю. Теперь, как у кадра дня, прогону можно назвать момент.
-- Крон зовёт без аргумента - сейчас.

drop function public.send_week_summaries();

create or replace function public.send_week_summaries(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  person record;
  local_now timestamp;
  monday date;
  summary jsonb;
  mine jsonb;
  body text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := at at time zone person.tz;
    -- Воскресенье (isodow 7), 20:00
    if extract(isodow from local_now)::int <> 7 or extract(hour from local_now)::int <> 20 then
      continue;
    end if;
    monday := local_now::date - 6;
    if exists (select 1 from public.week_notices n where n.user_id = person.user_id and n.week_start = monday) then
      continue;
    end if;
    insert into public.week_notices (user_id, week_start) values (person.user_id, monday) on conflict do nothing;

    summary := public.week_summary_of(monday);
    select x into mine from jsonb_array_elements(summary -> 'people') x where x ->> 'userId' = person.user_id::text;
    if mine is null then
      continue;
    end if;
    body := public.tx(person.user_id, 'n.week.body',
                      mine ->> 'diaryDays', mine ->> 'workouts', mine ->> 'gratitudes');
    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tg_escape(public.tx(person.user_id, 'n.week.title')) || '</b>' || E'\n\n' || public.tg_escape(body),
      'week');
    perform public.push_notify(person.user_id, public.tx(person.user_id, 'n.week.title'), body, 'week', '/week');
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.send_week_summaries(timestamptz) from anon, public, authenticated;

