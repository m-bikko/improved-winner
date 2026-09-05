-- Огонёк: сколько дней подряд человек отмечал самочувствие.
--
-- Длину серии НЕ храним, а считаем. Хранимый счётчик пришлось бы двигать
-- из четырёх мест (отметка, удаление отметки, восстановление, полночь),
-- и первое же расхождение с фактом было бы невидимым: число в интерфейсе
-- есть, проверить его нечем. Считаем из самих отметок - тогда огонёк
-- по определению равен тому, что человек сделал.
--
-- Восстановление - отдельная таблица, а не фиктивная строка в checkins:
-- пропущенный день не становится днём с самочувствием, у него нет ни
-- состояний, ни заметки. Свалив их в одну таблицу, мы бы врали и партнёру
-- («отметилась»), и статистике.

create table public.checkin_restores (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  -- Номер попытки в месяце. Не украшение: пара (месяц, номер) под уникальным
  -- индексом - это и есть ограничение «не больше двух в месяц», выраженное
  -- схемой. Считать в триггере значило бы держать инвариант вне базы.
  slot smallint not null check (slot in (1, 2)),
  month date not null generated always as (date_trunc('month', date::timestamp)::date) stored,
  created_at timestamptz not null default now(),

  primary key (user_id, date)
);

create unique index checkin_restores_slot on public.checkin_restores (user_id, month, slot);

alter table public.checkin_restores enable row level security;
revoke all on public.checkin_restores from anon;

create policy checkin_restores_select on public.checkin_restores for select to authenticated
  using (public.is_member());

-- Вставка только через RPC: она обязана проверить окно и занять свободный
-- слот. Прямой insert позволил бы восстановить день годовой давности.
revoke insert, update, delete on public.checkin_restores from authenticated;

-- ---------------------------------------------------------------------------
-- Длина серии на дату.
--
-- Якорь - сегодня, если день закрыт, иначе вчера: серия не должна гаснуть
-- в полдень только потому, что человек ещё не успел отметиться. Если и вчера
-- пусто - серии нет.

create or replace function public.checkin_streak(person uuid, today date)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with covered as (
    select c.date from public.checkins c where c.user_id = person
    union
    select r.date from public.checkin_restores r where r.user_id = person
  ),
  anchor as (
    select case
             when exists (select 1 from covered where date = today) then today
             when exists (select 1 from covered where date = today - 1) then today - 1
           end as day
  ),
  runs as (
    select c.date,
           c.date - (row_number() over (order by c.date))::int as run
      from covered c
     where c.date <= (select day from anchor)
  )
  select coalesce(
    (select count(*)::int from runs
      where run = (select run from runs where date = (select day from anchor))),
    0)
$$;

grant execute on function public.checkin_streak(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Что можно восстановить и сколько попыток осталось.
--
-- Окно - последние 7 дней и никогда не сегодня: сегодня ещё можно просто
-- отметиться, и подменять это восстановлением незачем.

create or replace function public.checkin_restorable(today date)
returns table (date date, month_left int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  gap as (
    select d::date as date
      from generate_series(today - 7, today - 1, interval '1 day') d
     where not exists (
       select 1 from public.checkins c
        where c.user_id = (select uid from me) and c.date = d::date)
       and not exists (
       select 1 from public.checkin_restores r
        where r.user_id = (select uid from me) and r.date = d::date)
  )
  select g.date,
         2 - (select count(*)::int from public.checkin_restores r
               where r.user_id = (select uid from me)
                 and r.month = date_trunc('month', g.date::timestamp)::date)
    from gap g
   order by g.date desc
$$;

grant execute on function public.checkin_restorable(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Восстановление дня.
--
-- Слот выбирается наименьший свободный, а уникальный индекс страхует от гонки:
-- два одновременных вызова не смогут занять один и тот же номер, и второй
-- честно упадёт, а не тихо создаст третье восстановление в месяце.

create or replace function public.restore_checkin_day(target_date date, today date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  free_slot smallint;
begin
  if not public.is_member() then
    raise exception 'Нет доступа';
  end if;

  if target_date >= today then
    raise exception 'Восстанавливать можно только прошедший день';
  end if;

  if target_date < today - 7 then
    raise exception 'Слишком давно: восстановить можно день за последнюю неделю';
  end if;

  if exists (select 1 from public.checkins c where c.user_id = me and c.date = target_date) then
    raise exception 'В этот день отметка уже есть';
  end if;

  select s into free_slot
    from generate_series(1, 2) s
   where not exists (
     select 1 from public.checkin_restores r
      where r.user_id = me
        and r.month = date_trunc('month', target_date::timestamp)::date
        and r.slot = s)
   order by s
   limit 1;

  if free_slot is null then
    raise exception 'Восстановления на этот месяц кончились';
  end if;

  insert into public.checkin_restores (user_id, date, slot)
  values (me, target_date, free_slot);
end;
$$;

revoke execute on function public.restore_checkin_day(date, date) from public, anon;
grant execute on function public.restore_checkin_day(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Напоминание в 22:00, если день так и не закрыт.
--
-- Второе напоминание за день, поэтому у отметки о рассылке появляется вид:
-- иначе строка от 11:00 закрыла бы дорогу вечерней.

alter table public.checkin_asks add column kind text not null default 'day'
  check (kind in ('day', 'evening'));

alter table public.checkin_asks drop constraint checkin_asks_pkey;
alter table public.checkin_asks add primary key (user_id, date, kind);

create or replace function public.ask_checkins_evening()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  local_now timestamp;
  today date;
  streak int;
  tail text;
  missed text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 22 then
      continue;
    end if;

    if exists (
      select 1 from public.checkin_asks a
       where a.user_id = person.user_id and a.date = today and a.kind = 'evening'
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.checkins c
       where c.user_id = person.user_id and c.date = today
    ) then
      insert into public.checkin_asks (user_id, date, kind)
      values (person.user_id, today, 'evening')
      on conflict do nothing;
      continue;
    end if;

    missed := public.by_sex(person.user_id,
      'так и не отметился', 'так и не отметилась', 'сегодня без отметки');

    -- Серию считаем на вчера: сегодня по определению пусто, а якорь «вчера»
    -- как раз и даёт то число, которое сгорит в полночь
    streak := public.checkin_streak(person.user_id, today - 1);

    tail := case
      when streak >= 2 then 'Огонёк на ' || streak || ' '
        || case when streak % 10 = 1 and streak % 100 <> 11 then 'день'
                when streak % 10 between 2 and 4 and streak % 100 not between 12 and 14 then 'дня'
                else 'дней' end
        || ' сгорит в полночь.'
      when streak = 1 then 'Огонёк сгорит в полночь.'
      else 'Отметишься - зажжётся огонёк.'
    end;

    perform public.tg_notify_self(
      person.user_id,
      '<b>День почти кончился</b>' || E'\n\n'
        || 'Ты ' || missed || '. ' || tail
    );
    perform public.push_notify(
      person.user_id,
      'День почти кончился',
      tail,
      '/checkin'
    );

    insert into public.checkin_asks (user_id, date, kind)
    values (person.user_id, today, 'evening')
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.ask_checkins_evening() from public, anon, authenticated;

select cron.schedule('checkin-asks-evening', '0 * * * *', $$ select public.ask_checkins_evening() $$);
