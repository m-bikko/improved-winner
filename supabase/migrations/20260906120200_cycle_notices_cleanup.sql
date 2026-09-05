-- Убрана мёртвая переменная из send_cycle_notices.
--
-- procedure_dummy я объявил и не использовал. Postgres такое пропускает,
-- и функция работает - но следующий читатель потратит минуту, выясняя,
-- зачем она. Отдельной миграцией, потому что предыдущая уже применена.

create or replace function public.send_cycle_notices()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner record;
  st record;
  st_prev record;
  tz text;
  local_now timestamp;
  today date;
  partner_id uuid;
  shared boolean;
  nick text;
  title text;
  body_owner text;
  body_partner text;
  sent int := 0;
begin
  for owner in
    select p.user_id, p.nickname, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
      join public.cycle_settings s on s.user_id = p.user_id
     where s.tracking_enabled
  loop
    tz := owner.tz;
    local_now := now() at time zone tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 13 then
      continue;
    end if;

    select * into st from public.cycle_state(owner.user_id, today);
    if st.day is null then
      continue;
    end if;

    select * into st_prev from public.cycle_state(owner.user_id, today - 1);

    shared := public.cycle_shared_with_me(owner.user_id);
    select m.user_id into partner_id
      from public.app_members m where m.user_id <> owner.user_id limit 1;
    nick := coalesce(owner.nickname, 'Партнёр');

    -- 1. Предполагаемое начало менструации
    if today = st.next_start
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'period'
       )
    then
      title := 'Менструация ожидается сегодня';
      body_owner := 'По среднему циклу. Сдвиг на пару дней - обычное дело; когда начнётся, отметьте, и прогноз станет точнее.';
      body_partner := 'У ' || nick || ' по прогнозу начало цикла. Это оценка, а не факт.';

      perform public.tg_notify_self(owner.user_id, '<b>' || title || '</b>' || E'\n\n' || body_owner);
      perform public.push_notify(owner.user_id, title, body_owner);
      if shared and partner_id is not null then
        perform public.tg_notify_self(partner_id, '<b>' || title || '</b>' || E'\n\n' || body_partner);
        perform public.push_notify(partner_id, title, body_partner);
      end if;

      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'period') on conflict do nothing;
      sent := sent + 1;
    end if;

    -- 2. Смена фазы: сегодня первый день новой
    if st_prev.phase is not null and st_prev.phase <> st.phase
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'phase'
       )
    then
      title := case st.phase
        when 'menstrual' then 'Началась менструальная фаза'
        when 'follicular' then 'Началась фолликулярная фаза'
        when 'ovulation' then 'Овуляция'
        else 'Началась лютеиновая фаза'
      end;
      body_owner := 'День ' || st.day || ' цикла из ~' || st.cycle_length || '.';
      body_partner := 'У ' || nick || ': день ' || st.day || ' цикла.';

      perform public.tg_notify_self(owner.user_id, '<b>' || title || '</b>' || E'\n\n' || body_owner);
      perform public.push_notify(owner.user_id, title, body_owner);
      if shared and partner_id is not null then
        perform public.tg_notify_self(partner_id, '<b>' || title || '</b>' || E'\n\n' || body_partner);
        perform public.push_notify(partner_id, title, body_partner);
      end if;

      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'phase') on conflict do nothing;
      sent := sent + 1;
    end if;

    -- 3. Подсказка дня
    if not exists (
      select 1 from public.cycle_notices n
       where n.user_id = owner.user_id and n.date = today and n.kind = 'tip'
    ) then
      title := 'День ' || st.day || ' цикла';
      body_owner := public.cycle_tip(st.phase, st.day);

      perform public.tg_notify_self(owner.user_id, '<b>' || title || '</b>' || E'\n\n' || body_owner);
      perform public.push_notify(owner.user_id, title, body_owner);
      -- Подсказка дня партнёру НЕ уходит: она обращена к тому, чьё это тело,
      -- и в чужих руках превращается в указание, что тому делать.
      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'tip') on conflict do nothing;
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;
