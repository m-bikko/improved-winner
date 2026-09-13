-- Благодарности попадают в «Год в цифрах».
--
-- Функция взята фактическим определением из базы и изменена ровно одним
-- полем. Переписывать её по памяти нельзя: у неё сто двадцать строк,
-- и я уже один раз в этом проекте «заменил» функцию, у которой на самом деле
-- другая сигнатура, - получив вторую перегрузку вместо замены.

create or replace function public.year_in_numbers(year integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  with bounds as (
    select make_date(year, 1, 1) as d0, make_date(year, 12, 31) as d1
  ),
  people as (
    select p.user_id, p.nickname
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  ),
  covered as (
    select c.user_id, c.date from public.checkins c, bounds b
     where c.date between b.d0 and b.d1
    union
    select r.user_id, r.date from public.checkin_restores r, bounds b
     where r.date between b.d0 and b.d1
  ),
  runs as (
    select user_id, date,
           date - (row_number() over (partition by user_id order by date))::int as run
      from covered
  ),
  streaks as (
    select user_id, max(n)::int as best from (
      select user_id, run, count(*) as n from runs group by user_id, run
    ) x group by user_id
  ),
  states as (
    select c.user_id, s.st, count(*)::int as n
      from public.checkins c, bounds b, unnest(c.states) s(st)
     where c.date between b.d0 and b.d1
     group by c.user_id, s.st
  ),
  top_states as (
    select user_id, jsonb_agg(jsonb_build_object('id', st, 'n', n) order by n desc) as list
      from (
        select user_id, st, n,
               row_number() over (partition by user_id order by n desc, st) as rank
          from states
      ) x where rank <= 3 group by user_id
  ),
  foods as (
    select e.user_id, e.name_snapshot as name, count(*)::int as n
      from public.diary_entries e, bounds b
     where e.date between b.d0 and b.d1
     group by e.user_id, e.name_snapshot
  ),
  top_foods as (
    select user_id, jsonb_agg(jsonb_build_object('name', name, 'n', n) order by n desc) as list
      from (
        select user_id, name, n,
               row_number() over (partition by user_id order by n desc, name) as rank
          from foods
      ) x where rank <= 3 group by user_id
  ),
  diary as (
    select e.user_id,
           count(distinct e.date)::int as days,
           round(sum(e.kcal) / nullif(count(distinct e.date), 0))::int as avg_kcal
      from public.diary_entries e, bounds b
     where e.date between b.d0 and b.d1
     group by e.user_id
  ),
  training as (
    select w.user_id, count(*)::int as n,
           sum(w.minutes)::int as minutes,
           round(sum(w.kcal))::int as kcal
      from public.workouts w, bounds b
     where w.date between b.d0 and b.d1
     group by w.user_id
  ),
  weights as (
    select user_id,
           (array_agg(weight_kg order by date))[1] as first_kg,
           (array_agg(weight_kg order by date desc))[1] as last_kg
      from public.weight_log w, bounds b
     where w.date between b.d0 and b.d1
     group by user_id
  )
  select jsonb_build_object(
    'year', year,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.user_id,
        'nickname', p.nickname,
        'checkinDays', coalesce((select count(*)::int from covered c where c.user_id = p.user_id), 0),
        'bestStreak', coalesce(s.best, 0),
        'topStates', coalesce(ts.list, '[]'::jsonb),
        'diaryDays', coalesce(d.days, 0),
        'avgKcal', d.avg_kcal,
        'topFoods', coalesce(tf.list, '[]'::jsonb),
        'workouts', coalesce(tr.n, 0),
        'workoutMinutes', coalesce(tr.minutes, 0),
        'workoutKcal', coalesce(tr.kcal, 0),
        'weightFrom', w.first_kg,
        'weightTo', w.last_kg
      ) order by p.nickname)
        from people p
        left join streaks s on s.user_id = p.user_id
        left join top_states ts on ts.user_id = p.user_id
        left join top_foods tf on tf.user_id = p.user_id
        left join diary d on d.user_id = p.user_id
        left join training tr on tr.user_id = p.user_id
        left join weights w on w.user_id = p.user_id
    ), '[]'::jsonb),
    'together', jsonb_build_object(
      'topicsOpened', (select count(*)::int from public.topics t, bounds b
                        where t.created_at::date between b.d0 and b.d1),
      'topicsClosed', (select count(*)::int from public.topics t, bounds b
                        where t.closed_at::date between b.d0 and b.d1),
      'tasksDone', (select count(*)::int from public.tasks t, bounds b
                     where t.done_at::date between b.d0 and b.d1),
      'wishesAdded', (select count(*)::int from public.wishlists w, bounds b
                       where w.created_at::date between b.d0 and b.d1),
      'commentsWritten', (select count(*)::int from public.topic_comments c, bounds b
                           where c.created_at::date between b.d0 and b.d1),
      'thanksSaid', (select count(*)::int from public.gratitudes g, bounds b
                      where g.created_at::date between b.d0 and b.d1)
    )
  )
$$
;
