-- Наша неделя.
--
-- Воскресным вечером - сводка за неделю из того, что уже записано: дневник
-- по дням, тренировки, вес, «как ты», «спасибо», вопросы дня, челленджи,
-- кадры, воспоминания, кино, встречи. Вводить ничего не нужно. Неделя -
-- промежуток, на котором привычка уже видна, а не забыта, как к концу
-- месяца.
--
-- Одна функция на экран и на уведомление, чтобы цифры в push и на экране
-- не разошлись. Неделю (понедельник) называет клиент: дату дня считает он.
-- Для записей со временем (благодарности, голосовые) день - по поясу автора.
--
-- Считает в обход RLS (security definer): вопрос дня и кадры слепые, и под
-- RLS у второго считались бы только дни, когда ответил и ты. Наружу уходят
-- одни числа - кто в какой день ответил, и так открыто (question_progress,
-- shot_progress). Внутренняя функция - для рассылки, где участника нет;
-- клиенту - обёртка с проверкой, что спрашивает участник.

create or replace function public.week_summary_of(d0 date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (select d0, d0 + 6 as d1),
  people as (
    select p.user_id, p.nickname, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  ),
  eaten as (
    select e.user_id, e.date, sum(e.kcal) as kcal
      from public.diary_entries e, b
     where e.date between b.d0 and b.d1
     group by e.user_id, e.date
  ),
  food as (
    select e.user_id, count(*)::int as days, round(avg(e.kcal))::int as avg_kcal,
           round(avg(g.kcal))::int as avg_goal
      from eaten e
      left join public.daily_goals g on g.user_id = e.user_id and g.date = e.date
     group by e.user_id
  ),
  weights as (
    select w.user_id,
           (array_agg(w.weight_kg order by w.date))[1] as first_kg,
           (array_agg(w.weight_kg order by w.date desc))[1] as last_kg
      from public.weight_log w, b
     where w.date between b.d0 and b.d1
     group by w.user_id
  ),
  training as (
    select w.user_id, count(*)::int as n, coalesce(sum(w.minutes), 0)::int as minutes
      from public.workouts w, b
     where w.date between b.d0 and b.d1
     group by w.user_id
  ),
  counts as (
    select p.user_id,
      (select count(*) from public.checkins c, b where c.user_id = p.user_id and c.date between b.d0 and b.d1)::int as checkins,
      (select count(*) from public.gratitudes g, b
        where g.author_id = p.user_id and (g.created_at at time zone p.tz)::date between b.d0 and b.d1)::int as gratitudes,
      (select count(*) from public.question_answers q, b
        where q.user_id = p.user_id and q.date between b.d0 and b.d1)::int as questions,
      (select count(*) from public.challenge_marks c, b
        where c.user_id = p.user_id and c.date between b.d0 and b.d1)::int as marks,
      (select count(*) from public.voice_notes v, b
        where v.author_id = p.user_id and (v.created_at at time zone p.tz)::date between b.d0 and b.d1)::int as voice,
      (select count(*) from public.shots s, b where s.user_id = p.user_id and s.day between b.d0 and b.d1)::int as shots
      from people p
  ),
  both_days as (
    select
      (select count(*) from (
         select q.date from public.question_answers q, b
          where q.date between b.d0 and b.d1 group by q.date having count(distinct q.user_id) >= 2) x)::int as questions,
      (select count(*) from (
         select s.day from public.shots s, b
          where s.day between b.d0 and b.d1 group by s.day having count(distinct s.user_id) >= 2) x)::int as shots,
      (select count(*) from public.memories m, b where m.happened_on between b.d0 and b.d1)::int as memories,
      (select count(*) from public.watch_items w, b where w.watched_on between b.d0 and b.d1)::int as watched,
      (select coalesce(sum(least(m.ends_on, b.d1) - greatest(m.starts_on, b.d0) + 1), 0)
         from public.meetings m, b
        where m.starts_on <= b.d1 and m.ends_on >= b.d0)::int as meeting_days,
      (select count(*) from public.savings_deposits s, b where s.date between b.d0 and b.d1 and s.amount > 0)::int as deposits
  )
  select jsonb_build_object(
    'from', (select d0 from b),
    'to', (select d1 from b),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.user_id,
        'nickname', p.nickname,
        'diaryDays', coalesce(f.days, 0),
        'avgKcal', f.avg_kcal,
        'avgGoal', f.avg_goal,
        'workouts', coalesce(t.n, 0),
        'workoutMinutes', coalesce(t.minutes, 0),
        'weightFrom', w.first_kg,
        'weightTo', w.last_kg,
        'checkins', c.checkins,
        'gratitudes', c.gratitudes,
        'questions', c.questions,
        'challengeMarks', c.marks,
        'voice', c.voice,
        'shots', c.shots
      ) order by p.user_id)
        from people p
        left join food f on f.user_id = p.user_id
        left join weights w on w.user_id = p.user_id
        left join training t on t.user_id = p.user_id
        left join counts c on c.user_id = p.user_id
    ), '[]'::jsonb),
    'together', (
      select jsonb_build_object(
        'questions', d.questions,
        'shots', d.shots,
        'memories', d.memories,
        'watched', d.watched,
        'meetingDays', d.meeting_days,
        'deposits', d.deposits
      ) from both_days d
    )
  )
$$;

revoke execute on function public.week_summary_of(date) from public, anon, authenticated;

create or replace function public.week_summary(d0 date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_member() then public.week_summary_of(d0) end
$$;

revoke execute on function public.week_summary(date) from public, anon;
grant execute on function public.week_summary(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Воскресенье, 20:00 по месту: короткая строка о своей неделе. Подробно -
-- на экране, в push - три числа, которые читаются с экрана блокировки

insert into public.texts (key, lang, value) values
  ('n.week.title', 'ru', 'Ваша неделя'),
  ('n.week.title', 'kk', 'Сендердің аптаңдар'),
  ('n.week.title', 'en', 'Your week'),
  ('n.week.body', 'ru', 'Дневник: %1$s из 7 дней · тренировок: %2$s · «спасибо»: %3$s'),
  ('n.week.body', 'kk', 'Күнделік: 7 күннің %1$s · жаттығу: %2$s · «рақмет»: %3$s'),
  ('n.week.body', 'en', 'Food diary: %1$s of 7 days · workouts: %2$s · thank-yous: %3$s')
on conflict (key, lang) do update set value = excluded.value;

create table if not exists public.week_notices (
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.week_notices enable row level security;
revoke all on public.week_notices from anon, public;
create policy week_notices_select on public.week_notices for select to authenticated using (public.is_member());

create or replace function public.send_week_summaries()
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
    local_now := now() at time zone person.tz;
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

revoke execute on function public.send_week_summaries() from anon, public, authenticated;

select cron.schedule('week-summaries', '0 * * * *', 'select public.send_week_summaries()');
