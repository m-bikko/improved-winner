-- Итоги месяца: сходится ли то, что вы делаете.
--
-- Между днём и годом в приложении было пусто. День не отвечает на вопрос
-- «работает ли», год отвечает слишком поздно. Месяц - тот промежуток,
-- на котором изменение веса уже видно, а поправить ещё не поздно.
--
-- ДЕФИЦИТ СЧИТАЕТСЯ КАК НОРМА МИНУС СЪЕДЕННОЕ, и расход на тренировках
-- в него НЕ добавляется. Норма считается по Миффлину с коэффициентом
-- активности, то есть регулярные тренировки в ней уже учтены. Прибавить
-- их ещё раз значило бы удвоить и получить дефицит, которого не было.
-- Тренировки в сводке показываются отдельной строкой - как факт, а не
-- как слагаемое.
--
-- Ожидаемое изменение веса - по 7700 ккал на килограмм жира. Это грубый
-- ориентир: вес движется ещё и водой с гликогеном, и на месяце это
-- легко даёт килограмм в любую сторону. Поэтому сводка сравнивает
-- порядок величин, а не числа.

create or replace function public.month_summary(year int, month int)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select make_date(year, month, 1) as d0,
           (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date as d1
  ),
  people as (
    select p.user_id, p.nickname
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  ),
  eaten as (
    select e.user_id, e.date, sum(e.kcal) as kcal
      from public.diary_entries e, bounds b
     where e.date between b.d0 and b.d1
     group by e.user_id, e.date
  ),
  -- Только дни, где есть И еда, И замороженная норма: день без нормы
  -- нельзя сравнить ни с чем, а день без еды означает «не записывал»,
  -- а не «не ел»
  paired as (
    select e.user_id, e.date, e.kcal, g.kcal as goal
      from eaten e
      join public.daily_goals g on g.user_id = e.user_id and g.date = e.date
  ),
  food as (
    select user_id,
           count(*)::int as days,
           round(avg(kcal))::int as avg_kcal,
           round(avg(goal))::int as avg_goal,
           round(sum(goal - kcal))::int as deficit
      from paired group by user_id
  ),
  weights as (
    select w.user_id,
           (array_agg(w.weight_kg order by w.date))[1] as first_kg,
           (array_agg(w.weight_kg order by w.date desc))[1] as last_kg,
           count(*)::int as points
      from public.weight_log w, bounds b
     where w.date between b.d0 and b.d1
     group by w.user_id
  ),
  training as (
    select w.user_id, count(*)::int as n,
           sum(w.minutes)::int as minutes, round(sum(w.kcal))::int as kcal
      from public.workouts w, bounds b
     where w.date between b.d0 and b.d1
     group by w.user_id
  )
  select jsonb_build_object(
    'year', year,
    'month', month,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.user_id,
        'nickname', p.nickname,
        'days', coalesce(f.days, 0),
        'avgKcal', f.avg_kcal,
        'avgGoal', f.avg_goal,
        'deficit', f.deficit,
        -- Ожидаемое изменение: дефицит положителен - вес должен падать
        'expectedKg', case when f.deficit is null then null
                           else round(-f.deficit / 7700.0, 1) end,
        'weightFrom', w.first_kg,
        'weightTo', w.last_kg,
        'weightPoints', coalesce(w.points, 0),
        'workouts', coalesce(t.n, 0),
        'workoutMinutes', coalesce(t.minutes, 0),
        'workoutKcal', coalesce(t.kcal, 0)
      ) order by p.nickname)
        from people p
        left join food f on f.user_id = p.user_id
        left join weights w on w.user_id = p.user_id
        left join training t on t.user_id = p.user_id
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.month_summary(int, int) from public, anon;
grant execute on function public.month_summary(int, int) to authenticated;
