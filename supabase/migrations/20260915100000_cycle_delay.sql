-- Задержка: счёт дней, уведомление и вид отметки.
--
-- Прежде о задержке не говорилось ничего, пока не набралось среднего по её
-- собственным циклам, - то есть ровно у той, кто начала вести недавно.
-- Восемнадцатый день задержки был виден на экране числом «День 47» и не
-- сопровождался ни словом; предупреждение появлялось только на девяностый.
--
-- Отсюда правило, которое держит эта функция: когда среднего нет, считаем
-- от 35 дней - верхней границы общепринятого коридора. Это не выдумывание
-- нормы за человека: дальше 35 дней цикл выходит за коридор у кого угодно,
-- и об этом уже можно сказать, ничего не предполагая. Что счёт идёт не от её
-- числа, сказано в интерфейсе прямо.
--
-- Клиент считает то же самое в `delayOf()`. Две реализации сверяются
-- в check-cycle - как фаза, и по той же причине: рассылает база, а рисует
-- клиент, и разойтись они могут молча.

create or replace function public.cycle_delay(owner uuid, on_date date)
returns table(days int, level text, basis text, since_last int)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  last_row record;
  avg_cycle numeric;
  base int;
begin
  select p.started_on, p.ended_on into last_row
    from public.periods p
   where p.user_id = owner and p.started_on <= on_date
   order by p.started_on desc
   limit 1;
  if not found then
    return;
  end if;

  -- Менструация идёт прямо сейчас - задержки нет по определению. Запись,
  -- которую забыли закрыть, ловит предупреждение о длительном кровотечении.
  if last_row.ended_on is null then
    return;
  end if;

  -- Только правдоподобные значения, границы те же, что в PLAUSIBLE
  -- на клиенте: однодневная отметка не должна становиться законом.
  select avg(d) into avg_cycle from (
    select (lead(p.started_on) over (order by p.started_on) - p.started_on) as d
      from public.periods p where p.user_id = owner
  ) x where d between 15 and 60;

  basis := case when avg_cycle is null then 'assumed' else 'measured' end;
  base := case when avg_cycle is null then 35 else round(avg_cycle) end;
  since_last := on_date - last_row.started_on;
  days := since_last - base;

  if since_last >= 90 then
    level := 'absent';
    return next;
    return;
  end if;

  -- Ниже трёх дней молчим совсем: разброс в пару дней бывает у всех,
  -- и говорить о нём значит пугать без повода.
  if days < 3 then
    return;
  end if;

  level := case
    when days >= 15 then 'long'
    when days >= 8 then 'notable'
    else 'slight'
  end;
  return next;
end;
$$;

revoke execute on function public.cycle_delay(uuid, date) from anon, public;
grant execute on function public.cycle_delay(uuid, date) to authenticated;

-- Новый вид отметки: чтобы уведомление о задержке не ушло дважды за день.
alter table public.cycle_notices drop constraint cycle_notices_kind_check;
alter table public.cycle_notices add constraint cycle_notices_kind_check
  check (kind in ('period', 'phase', 'tip', 'delay'));

insert into public.texts (key, lang, value) values
  ('n.cycle.delay.title', 'ru', 'Менструация задерживается'),
  ('n.cycle.delay.title', 'kk', 'Етеккір кешігіп тұр'),
  ('n.cycle.delay.title', 'en', 'Your period is late'),
  ('n.cycle.delay.d3', 'ru', 'Третий день сверх ожидаемого. Сдвиг на несколько дней случается от стресса, перелёта или болезни - запишите в заметку дня, что было в этом месяце. Через месяц этого не вспомнит никто.'),
  ('n.cycle.delay.d3', 'kk', 'Күтілгеннен үшінші күн. Бірнеше күнге жылжу стрестен, ұшудан немесе аурудан болады - осы айда не болғанын күн жазбасына жазып қойыңыз. Бір айдан кейін мұны ешкім есіне түсірмейді.'),
  ('n.cycle.delay.d3', 'en', 'Three days past the expected date. A shift of a few days comes from stress, a flight or an illness - write into the day note what happened this month. Nobody remembers it a month later.'),
  ('n.cycle.delay.d7', 'ru', 'Неделя сверх ожидаемого. Тест имеет смысл сделать уже сейчас, даже если беременность кажется маловероятной. В разделе цикла есть отдельная подборка про задержку.'),
  ('n.cycle.delay.d7', 'kk', 'Күтілгеннен бір апта. Жүктілік екіталай көрінсе де, тестті қазірдің өзінде жасаған жөн. Цикл бөлімінде кешігу туралы бөлек жинақ бар.'),
  ('n.cycle.delay.d7', 'en', 'A week past the expected date. A test is worth taking now, even if pregnancy seems unlikely. The cycle section has a separate set of entries about late periods.')
on conflict (key, lang) do update set value = excluded.value;

-- Рассылка: к трём поводам добавился четвёртый.
-- Тело снято с живой функции: переписывать его по памяти уже
-- оборачивалось потерянной подписью и подменённым security invoker.
create or replace function public.send_cycle_notices()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$

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
  phase_key text;
  dl record;
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

    -- 1. Предполагаемое начало менструации
    if today = st.next_start
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'period'
       )
    then
      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, 'n.cycle.period.title') || '</b>' || E'\n\n'
          || public.tx(owner.user_id, 'n.cycle.period.owner'), 'cycle');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, 'n.cycle.period.title'),
        public.tx(owner.user_id, 'n.cycle.period.owner'), 'cycle');

      if shared and partner_id is not null then
        nick := coalesce(owner.nickname, public.tx(partner_id, 'n.partner'));
        perform public.tg_notify_self(
          partner_id,
          '<b>' || public.tx(partner_id, 'n.cycle.period.title') || '</b>' || E'\n\n'
            || public.tx(partner_id, 'n.cycle.period.partner', nick), 'cycle');
        perform public.push_notify(
          partner_id,
          public.tx(partner_id, 'n.cycle.period.title'),
          public.tx(partner_id, 'n.cycle.period.partner', nick), 'cycle');
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
      phase_key := 'n.cycle.phase.' || st.phase;

      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, phase_key) || '</b>' || E'\n\n'
          || public.tx(
               owner.user_id, 'n.cycle.phase.owner',
               st.day::text, st.cycle_length::text), 'cycle');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, phase_key),
        public.tx(
          owner.user_id, 'n.cycle.phase.owner', st.day::text, st.cycle_length::text),
        'cycle');

      if shared and partner_id is not null then
        nick := coalesce(owner.nickname, public.tx(partner_id, 'n.partner'));
        perform public.tg_notify_self(
          partner_id,
          '<b>' || public.tx(partner_id, phase_key) || '</b>' || E'\n\n'
            || public.tx(partner_id, 'n.cycle.phase.partner', nick, st.day::text), 'cycle');
        perform public.push_notify(
          partner_id,
          public.tx(partner_id, phase_key),
          public.tx(partner_id, 'n.cycle.phase.partner', nick, st.day::text), 'cycle');
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
      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, 'n.cycle.tip.title', st.day::text) || '</b>'
          || E'\n\n'
          || public.tx(owner.user_id, public.cycle_tip_key(st.phase, st.day)),
        'cycle_tips');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, 'n.cycle.tip.title', st.day::text),
        public.tx(owner.user_id, public.cycle_tip_key(st.phase, st.day)),
        'cycle_tips');
      -- Подсказка дня партнёру НЕ уходит: она обращена к тому, чьё это тело,
      -- и в чужих руках превращается в указание, что тому делать.
      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'tip') on conflict do nothing;
      sent := sent + 1;
    end if;

    -- 4. Задержка: ровно на третий и седьмой день, и больше никогда.
    --
    -- Ежедневное напоминание о задержке - худшее, что можно придумать:
    -- человек и так о ней помнит, а приложение превращалось бы в того
    -- самого, кто спрашивает «ну что?» каждое утро. Два раза: когда ещё
    -- рано делать выводы, и когда уже имеет смысл тест.
    --
    -- Партнёру не уходит вовсе, даже при открытом доступе. Задержка -
    -- это про решения, которые принимает она, и узнавать о ней он должен
    -- от неё, а не из уведомления.
    select * into dl from public.cycle_delay(owner.user_id, today);
    if dl.days in (3, 7)
       and not exists (
         select 1 from public.cycle_notices n
          where n.user_id = owner.user_id and n.date = today and n.kind = 'delay'
       )
    then
      perform public.tg_notify_self(
        owner.user_id,
        '<b>' || public.tx(owner.user_id, 'n.cycle.delay.title') || '</b>' || E'

'
          || public.tx(
               owner.user_id,
               case when dl.days = 3 then 'n.cycle.delay.d3' else 'n.cycle.delay.d7' end),
        'cycle');
      perform public.push_notify(
        owner.user_id,
        public.tx(owner.user_id, 'n.cycle.delay.title'),
        public.tx(
          owner.user_id,
          case when dl.days = 3 then 'n.cycle.delay.d3' else 'n.cycle.delay.d7' end),
        'cycle');

      insert into public.cycle_notices (user_id, date, kind)
      values (owner.user_id, today, 'delay') on conflict do nothing;
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$function$;
