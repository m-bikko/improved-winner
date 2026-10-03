-- Подаренное - не идея.
--
-- После отметки «подарено» напоминание о следующем празднике снова
-- предлагало идеи из вишлиста - и первой среди них стояла та самая вещь,
-- которую уже подарили: владелец её ещё не удалил. Теперь всё, что ты
-- бронировал или уже подарил, в идеи не попадает.

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
                 -- Уже подаренное тобой - не идея
                 and not exists (
                   select 1 from public.wish_reservations r
                    where r.wish_id = x.id and r.user_id = person.user_id
                 )
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
