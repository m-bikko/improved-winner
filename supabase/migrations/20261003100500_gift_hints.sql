-- Подсказка подарка.
--
-- За неделю до дня рождения второго или годовщины пары рассылка дат уже
-- говорила «есть неделя, чтобы успеть с подарком». Теперь к этому добавлены
-- три идеи из вишлиста второго: «Аминош хочет: шарф, поездка в Грузию».
-- Всё нужное уже было в приложении - не хватало знать, чей день рождения.
--
-- Попутно: имениннику больше не приходит «успей с подарком» про его же день.

alter table public.occasions
  add column if not exists person_id uuid references auth.users on delete set null;

alter table public.occasions
  add constraint occasions_person_birthday check (person_id is null or kind = 'birthday');

comment on column public.occasions.person_id is
  'Чей день рождения - если это один из двоих. Пусто: чужой день рождения или не день рождения.';

-- Уже заведённые дни рождения: по имени в названии («День рождения Бикоша»),
-- а если остался один безымянный и один участник без дня рождения - его.
-- Ошибка тут не страшна: «чей» меняется в карточке даты
update public.occasions o
   set person_id = p.user_id
  from public.profiles p
  join public.app_members m on m.user_id = p.user_id
 where o.kind = 'birthday' and o.person_id is null
   and position(lower(p.nickname) in lower(o.title)) > 0;

with lone as (
  select id from public.occasions where kind = 'birthday' and person_id is null and yearly
), free as (
  select m.user_id from public.app_members m
   where not exists (select 1 from public.occasions o where o.person_id = m.user_id)
)
update public.occasions
   set person_id = (select user_id from free)
 where id = (select id from lone)
   and (select count(*) from lone) = 1
   and (select count(*) from free) = 1;

insert into public.texts (key, lang, value) values
  ('n.occasion.ideas', 'ru', '%1$s хочет: %2$s'),
  ('n.occasion.ideas', 'kk', '%1$s қалайды: %2$s'),
  ('n.occasion.ideas', 'en', '%1$s would love: %2$s')
on conflict (key, lang) do update set value = excluded.value;

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
