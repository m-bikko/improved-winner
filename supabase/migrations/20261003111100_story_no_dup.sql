-- История: идея, записанная в воспоминания, - один раз.
--
-- «Сделали» с галочкой «в воспоминания» давало в ленте две карточки
-- с одним названием: идею и воспоминание. Воспоминание богаче (фото, место),
-- поэтому идея с ним в ленту не попадает.

create or replace function public.story(today date, lang text default 'ru')
returns table (
  kind text,
  day date,
  at timestamptz,
  title text,
  detail text,
  ref text,
  photo text,
  placeholder text,
  n numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Даты пары: событие - сама дата, если она уже прошла
  select 'date', o.date, null::timestamptz, o.title, o.kind, o.id::text, null, null, null::numeric
    from public.occasions o
   where public.is_member() and o.kind <> 'birthday' and o.date <= today

  union all
  select 'meeting', m.starts_on, null, m.place, m.note, m.id::text, null, null, (m.ends_on - m.starts_on + 1)::numeric
    from public.meetings m
   where public.is_member() and m.starts_on <= today

  union all
  select 'memory', m.happened_on, null, m.caption, m.place, m.id::text, p.thumb_path, p.placeholder,
         (select count(*) from public.memory_photos x where x.memory_id = m.id)::numeric
    from public.memories m
    left join lateral (
      select x.thumb_path, x.placeholder from public.memory_photos x
       where x.memory_id = m.id order by x.position limit 1
    ) p on true
   where public.is_member() and m.happened_on <= today

  union all
  select 'agreement', null, t.closed_at, t.title, t.resolution, t.id::text, null, null, null
    from public.topics t
   where public.is_member() and t.status = 'closed' and t.resolution is not null

  union all
  -- Челлендж прошли до конца - день его последнего дня. Брошенные - нет:
  -- это история, а не отчёт о неудачах
  select 'challenge', c.started_on + c.days - 1, null, c.title, null, c.id::text, null, null, c.days::numeric
    from public.challenges c
   where public.is_member() and c.stopped_on is null and c.started_on + c.days - 1 < today

  union all
  -- Цель копилки достигнута - день взноса, который до неё дотянул
  select 'savings', x.date, null, x.title, x.currency, x.id::text, null, null, x.target::numeric
    from (
      select g.id, g.title, g.currency, g.target, d.date,
             sum(d.amount) over (partition by g.id order by d.date, d.created_at) as total,
             sum(d.amount) over (partition by g.id order by d.date, d.created_at
                                 rows between unbounded preceding and 1 preceding) as before
        from public.savings_goals g
        join public.savings_deposits d on d.goal_id = g.id
    ) x
   where public.is_member() and x.total >= x.target and coalesce(x.before, 0) < x.target

  union all
  select 'idea', d.done_on, null,
         coalesce(i.title, case lang when 'en' then i.title_en when 'kk' then i.title_kk else i.title_ru end),
         i.category, i.key, null, null, null
    from public.idea_done d
    join public.date_ideas i on i.key = d.idea_key
   -- Сделанная идея с воспоминанием уже есть в ленте воспоминанием - с фото
   where public.is_member() and d.done_on <= today and d.memory_id is null

  union all
  select 'pregnancy', null, g.created_at, null, null, null, null, null, null
    from public.pregnancy g
   where public.is_member()

  union all
  select 'baby', b.born_on, null, b.name, b.sex, b.id::text, null, null, b.weight_g
    from public.babies b
   where public.is_member() and b.born_on <= today

  union all
  -- Вехи «спасибо»: первое, десятое, пятидесятое, сотое...
  select 'gratitude', null, g.created_at, null, null, null, null, null, g.k::numeric
    from (
      select x.created_at, row_number() over (order by x.created_at) as k from public.gratitudes x
    ) g
   where public.is_member() and g.k in (1, 10, 50, 100, 250, 500, 1000)

  union all
  -- Вехи вопроса дня: дни, когда ответили оба
  select 'question', q.date, null, null, null, null, null, null, q.k::numeric
    from (
      select x.date, row_number() over (order by x.date) as k
        from (
          select a.date from public.question_answers a
           group by a.date having count(distinct a.user_id) >= 2
        ) x
    ) q
   where public.is_member() and q.k in (1, 10, 50, 100, 200, 365, 500, 1000)

  union all
  -- Вехи кадра дня: дни, когда сняли оба
  select 'shot', s.day, null, null, null, null, null, null, s.k::numeric
    from (
      select x.day, row_number() over (order by x.day) as k
        from (
          select a.day from public.shots a group by a.day having count(distinct a.user_id) >= 2
        ) x
    ) s
   where public.is_member() and s.k in (1, 10, 50, 100, 200, 365)
$$;

revoke execute on function public.story(date, text) from public, anon;
grant execute on function public.story(date, text) to authenticated;
