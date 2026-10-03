-- Бронь подарка.
--
-- В вишлисте второго можно тайно отметить «это дарю я». Владелец желания
-- брони не видит вовсе - ни строки, ни намёка: иначе сюрприз раскрыт.
-- Бронь видит только тот, кто бронировал (людей двое, так что «не владелец»
-- и «тот, кто бронировал» - одно и то же лицо).
--
-- Что даёт бронь:
-- - в напоминании о дне рождения или годовщине за неделю вместо трёх идей
--   приходит «ты даришь: шарф» - выбор уже сделан, напоминать надо о нём;
-- - если владелец удалил желание (купил сам, передумал), бронировавшему
--   приходит уведомление - чтобы не купить то, что уже не нужно;
-- - отметка «подарено» снимает бронь с напоминаний, но остаётся у дарившего.

create table public.wish_reservations (
  wish_id uuid primary key references public.wishlists on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  gifted_on date,
  created_at timestamptz not null default now()
);

comment on table public.wish_reservations is
  'Тайная бронь подарка из вишлиста второго. Владелец желания её не видит.';

alter table public.wish_reservations enable row level security;
revoke all on public.wish_reservations from anon;

-- Чужое ли желание - без доступа к своим броням второго
create or replace function public.wish_is_others(of_wish uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wishlists w where w.id = of_wish and w.created_by <> (select auth.uid())
  )
$$;

revoke execute on function public.wish_is_others(uuid) from public, anon;
grant execute on function public.wish_is_others(uuid) to authenticated;

create policy wish_reservations_select on public.wish_reservations for select to authenticated
  using (public.is_member() and user_id = (select auth.uid()));
create policy wish_reservations_insert on public.wish_reservations for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()) and public.wish_is_others(wish_id));
create policy wish_reservations_update on public.wish_reservations for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy wish_reservations_delete on public.wish_reservations for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

insert into public.texts (key, lang, value) values
  ('n.occasion.yourGift', 'ru', 'Ты даришь: %1$s'),
  ('n.occasion.yourGift', 'kk', 'Сен сыйлайсың: %1$s'),
  ('n.occasion.yourGift', 'en', 'Your present: %1$s'),
  ('n.wish.reservedGone', 'ru', 'Желание убрано из вишлиста'),
  ('n.wish.reservedGone', 'kk', 'Тілек тізімнен алынды'),
  ('n.wish.reservedGone', 'en', 'A wish was removed'),
  ('n.wish.reservedGoneBody', 'ru', '«%1$s» больше нет в вишлисте, а это был твой подарок. Бронь снята.'),
  ('n.wish.reservedGoneBody', 'kk', '«%1$s» тізімде енді жоқ, ал бұл сенің сыйлығың еді. Бронь алынды.'),
  ('n.wish.reservedGoneBody', 'en', '"%1$s" is no longer on the list, and you planned to give it. The reservation is gone.')
on conflict (key, lang) do update set value = excluded.value;

-- Владелец удалил желание - бронировавшему. До удаления: после него брони
-- уже нет (каскад), и не узнать, кто бронировал
create or replace function public.tg_on_reserved_wish_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select * into r from public.wish_reservations x
   where x.wish_id = old.id and x.gifted_on is null and x.user_id <> old.created_by;
  if not found then
    return old;
  end if;
  perform public.tg_notify_self(
    r.user_id,
    '<b>' || public.tg_escape(public.tx(r.user_id, 'n.wish.reservedGone')) || '</b>'
      || E'\n\n' || public.tg_escape(public.tx(r.user_id, 'n.wish.reservedGoneBody', old.title)),
    'wishlist');
  perform public.push_notify(
    r.user_id,
    public.tx(r.user_id, 'n.wish.reservedGone'),
    public.tx(r.user_id, 'n.wish.reservedGoneBody', old.title),
    'wishlist',
    '/wishlist');
  return old;
end;
$$;

revoke execute on function public.tg_on_reserved_wish_delete() from public, anon, authenticated;

create trigger wishlists_reserved_delete before delete on public.wishlists
  for each row execute function public.tg_on_reserved_wish_delete();

-- Напоминание о дате: бронь вместо идей
CREATE OR REPLACE FUNCTION public.notify_occasions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  partner uuid;
  ideas text;
  gift boolean;
  person record;
  item record;
  local_now timestamp;
  today date;
  next_on date;
  days int;
  years int;
  headline text;
  tail text;
  sent int := 0;
begin
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

    partner := public.partner_of(person.user_id);

    for item in select id, title, date, kind, yearly, note, person_id from public.occasions
    loop
      next_on := public.occasion_next(item.date, item.yearly, today);
      days := next_on - today;

      if days not in (0, 7) then
        continue;
      end if;

      if exists (
        select 1 from public.occasion_notices n
         where n.occasion_id = item.id and n.user_id = person.user_id
           and n.year = extract(year from next_on)::int and n.lead = days
      ) then
        continue;
      end if;

      years := extract(year from next_on)::int - extract(year from item.date)::int;
      tail := case
        when not item.yearly or years <= 0 then ''
        when item.kind = 'birthday' then E'\n' || public.tx(
          person.user_id, 'n.occasion.turns',
          years::text, public.tx_plural(person.user_id, 'n.year', years))
        else E'\n' || public.tx(person.user_id, 'n.occasion.anniversary', years::text)
      end;

      headline := public.tx(
        person.user_id,
        case when days = 0 then 'n.occasion.today' else 'n.occasion.inWeek' end);

      -- За неделю - про подарок, но не имениннику о его же дне рождения.
      -- Идеи - из вишлиста второго: его день рождения или годовщина пары
      gift := days = 7 and not (item.kind = 'birthday' and item.person_id = person.user_id);
      ideas := null;
      if gift and partner is not null
         and ((item.kind = 'birthday' and item.person_id = partner)
              or item.kind = 'anniversary') then
        -- Уже выбранный подарок важнее идей: «ты даришь: шарф»
        select string_agg(x.title, ', ' order by x.sort_order, x.created_at) into ideas
          from public.wishlists x
          join public.wish_reservations r on r.wish_id = x.id
         where x.created_by = partner and r.user_id = person.user_id and r.gifted_on is null;
        if ideas is not null then
          ideas := public.tx(person.user_id, 'n.occasion.yourGift', ideas);
        else
          select string_agg(w.title, ', ' order by w.sort_order, w.created_at) into ideas
            from (
              select x.title, x.sort_order, x.created_at
                from public.wishlists x
               where x.created_by = partner
               order by x.sort_order, x.created_at
               limit 3
            ) w;
          if ideas is not null then
            ideas := public.tx(person.user_id, 'n.occasion.ideas',
                               public.nick_for(person.user_id, partner), ideas);
          end if;
        end if;
      end if;

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || public.tg_escape(
            public.tx(person.user_id, 'n.occasion.head', headline, item.title))
          || '</b>'
          || public.tg_escape(tail)
          || case when gift
                  then E'\n\n' || public.tx(person.user_id, 'n.occasion.giftHint')
                  else '' end
          || case when ideas is null then '' else E'\n' || public.tg_escape(ideas) end
          || case when item.note is null or btrim(item.note) = '' then ''
                  else E'\n\n' || public.tg_escape(item.note) end
      , 'dates');
      perform public.push_notify(
        person.user_id,
        headline,
        item.title || replace(tail, E'\n', ' · ') || coalesce(E'\n' || ideas, ''), 'dates',
        '/dates'
      );

      insert into public.occasion_notices (occasion_id, user_id, year, lead)
      values (item.id, person.user_id, extract(year from next_on)::int, days)
      on conflict do nothing;

      sent := sent + 1;
    end loop;
  end loop;

  return sent;
end;
$function$;
