-- Последние три «Нет доступа» переводятся.
--
-- Сообщения охранных проверок в трёх функциях остались русскими: они писались
-- раньше словаря и мимо него прошли. Ни одно из них сегодня на экран не
-- попадает - вызывающий код показывает пустой список, а не ошибку, - но это
-- свойство вызывающего кода, а не этих функций. Один onError в компоненте,
-- и русская строка окажется на английском экране.
--
-- Предупреждения в push_notify и tg_notify_self не трогаем: они идут
-- в журнал сервера, а не человеку. То же и с «В Vault нет секрета» -
-- это сообщение читает тот, кто настраивает проект.

create or replace function public.checkin_cycle_patterns(owner uuid, since date)
returns table (state text, phase text, hits int, days_in_phase int, other_rate numeric,
               ratio numeric, observed_days int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '%', public.tx((select auth.uid()), 'e.noAccess');
  end if;

  -- Чужой цикл виден, только если владелец сам открыл доступ
  if owner is distinct from (select auth.uid())
     and not public.cycle_shared_with_me(owner) then
    raise exception '%', public.tx((select auth.uid()), 'e.noAccess');
  end if;

  return query
  with days as (
    select c.date, c.states, public.cycle_state(owner, c.date) as st
      from public.checkins c
     where c.user_id = owner and c.date >= since
  ),
  flat as (
    select d.date, unnest(d.states) as state, (d.st).phase as phase
      from days d
     where (d.st).phase is not null
  ),
  totals as (
    select f.phase, count(distinct f.date)::int as days_in_phase from flat f group by f.phase
  ),
  counted as (
    select f.state, f.phase, count(*)::int as hits from flat f group by f.state, f.phase
  )
  select c.state,
         c.phase,
         c.hits,
         t.days_in_phase,
         coalesce((
           select sum(c2.hits)::numeric / nullif(sum(t2.days_in_phase), 0)
             from counted c2 join totals t2 on t2.phase = c2.phase
            where c2.state = c.state and c2.phase <> c.phase
         ), 0) as other_rate,
         case
           when coalesce((
             select sum(c2.hits)::numeric / nullif(sum(t2.days_in_phase), 0)
               from counted c2 join totals t2 on t2.phase = c2.phase
              where c2.state = c.state and c2.phase <> c.phase
           ), 0) = 0 then null
           else (c.hits::numeric / t.days_in_phase) / (
             select sum(c2.hits)::numeric / nullif(sum(t2.days_in_phase), 0)
               from counted c2 join totals t2 on t2.phase = c2.phase
              where c2.state = c.state and c2.phase <> c.phase
           )
         end as ratio,
         (select count(distinct date)::int from flat) as observed_days
    from counted c join totals t on t.phase = c.phase
   where c.hits >= 3 and t.days_in_phase >= 5
   order by c.hits desc;
end;
$$;

revoke execute on function public.checkin_cycle_patterns(uuid, date) from public, anon;

create or replace function public.reorder_wishlists(ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '%', public.tx((select auth.uid()), 'e.noAccess');
  end if;

  update public.wishlists w
     set sort_order = idx.ord
    from (select id, ordinality::int as ord from unnest(ids) with ordinality as t(id, ordinality)) idx
   where w.id = idx.id;
end;
$$;

revoke execute on function public.reorder_wishlists(uuid[]) from public, anon;
