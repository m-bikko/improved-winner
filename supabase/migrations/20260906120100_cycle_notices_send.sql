-- Рассылка уведомлений по циклу.
--
-- Три вида в один заход, в 13:00 по поясу профиля:
--   period - предполагаемое начало менструации наступило сегодня;
--   phase  - сегодня первый день новой фазы;
--   tip    - подсказка дня.
--
-- Тексты РАЗНЫЕ для владельца и для партнёра, и это не вежливость.
-- «У вас сегодня ожидается менструация», пришедшее партнёру, - это не просто
-- нескладно, это сообщение не о нём. Партнёру говорится о другом человеке
-- и мягче: он наблюдатель, а не тот, кому надо что-то отметить.

create or replace function public.cycle_tip(phase text, day int)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Короткие строки, написанные ДЛЯ УВЕДОМЛЕНИЯ, а не скопированные
  -- из библиотеки в приложении: там подсказки длиной в абзац, и в шторку
  -- уведомления они не помещаются. Полные лежат в разделе, сюда ведёт ссылка.
  select (case phase
    when 'menstrual' then array[
      'Железо уходит с кровью: мясо, гречка, бобовые и витамин C рядом.',
      'Тепло на живот снимает спазм не хуже таблетки.',
      'Тренировку можно не отменять - достаточно срезать объём.',
      'Соли меньше, воды больше: отёки в эти дни обычное дело.'
    ]
    when 'follicular' then array[
      'Силы на подъёме - лучшие дни для тяжёлых тренировок.',
      'Отложенный трудный разговор пройдёт легче сейчас.',
      'Концентрация выше обычного: время для дел, до которых не доходит.',
      'Дефицит калорий на этом отрезке даётся легче всего.'
    ]
    when 'ovulation' then array[
      'Пик формы - самое лёгкое самочувствие за весь цикл.',
      'Тянет с одной стороны - так бывает. Сильно и долго - к врачу.',
      'Фертильное окно посчитано по календарю: предохраняться так нельзя.',
      'Аппетит ниже, а нагрузка выше - следите, чтобы добрать.'
    ]
    else array[
      'Вес выше на кило-два - это вода, а не жир.',
      'Тянет на сладкое не от слабоволия: расход в покое выше.',
      'Сон важнее обычного, кофеин во второй половине дня - меньше.',
      'Объём в зале срезать, веса оставить: жара переносится хуже.'
    ]
  end)[(abs(day) % 4) + 1]
$$;

revoke execute on function public.cycle_tip(text, int) from public, anon;

-- ---------------------------------------------------------------------------

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

  procedure_dummy int;
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

revoke execute on function public.send_cycle_notices() from public, anon, authenticated;

-- Каждый час: решение принимается по местному времени профиля, поэтому
-- одного расписания хватает на любые пояса.
select cron.schedule('cycle-notices', '0 * * * *', $$ select public.send_cycle_notices() $$);
