-- Подготовка к зачатию.
--
-- Готовятся двое, а не одна: мужской фактор - около половины случаев,
-- когда беременность не наступает, и обследование, анализы и образ жизни
-- касаются обоих. Поэтому план общий, а пункты у каждого свои, и каждый
-- видит, как идёт у второго.
--
-- Три вещи:
--   - дата начала подготовки - одна на пару: от неё считается, сколько
--     дней уже идёт приём фолиевой кислоты (её советуют начинать минимум
--     за месяц до зачатия, лучше за три);
--   - витамины по дням - у каждого свои отметки;
--   - чек-лист: пункты-заготовки живут в коде на трёх языках, здесь
--     только отметка «сделано»; свои пункты - строкой с названием.
--
-- Медицинских назначений приложение не делает: дозировки и анализы - с врачом,
-- и экран говорит это прямо.

-- Одна строка на пару: первичный ключ - константа true. Таблица «настроек
-- пары» понадобилась впервые, и заводить ради неё общую не стоит
create table public.prep_plan (
  id boolean primary key default true check (id),
  started_on date not null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.prep_vitamins (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.prep_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_key text check (item_key is null or item_key ~ '^[a-z0-9_]{1,40}$'),
  title text check (title is null or length(btrim(title)) between 1 and 120),
  done_on date,
  created_at timestamptz not null default now(),
  -- Либо заготовка из кода, либо свой пункт с названием - не оба и не ничего
  constraint prep_checks_one_of check ((item_key is null) <> (title is null)),
  -- Заготовка существует в базе только отмеченной: снятая галочка - это
  -- удалённая строка. Иначе было бы два способа сказать «не сделано»
  constraint prep_checks_preset_done check (item_key is null or done_on is not null)
);

create unique index prep_checks_preset on public.prep_checks (user_id, item_key)
  where item_key is not null;

comment on table public.prep_checks is
  'Чек-лист подготовки. item_key - заготовка из кода (строка = сделано), title - свой пункт.';

alter table public.prep_plan enable row level security;
alter table public.prep_vitamins enable row level security;
alter table public.prep_checks enable row level security;
revoke all on public.prep_plan from anon;
revoke all on public.prep_vitamins from anon;
revoke all on public.prep_checks from anon;

-- План общий: начать, сдвинуть дату или закончить может любой из двоих
create policy prep_plan_select on public.prep_plan for select to authenticated
  using (public.is_member());
create policy prep_plan_insert on public.prep_plan for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy prep_plan_update on public.prep_plan for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy prep_plan_delete on public.prep_plan for delete to authenticated
  using (public.is_member());

-- Отметки видят оба, ставит каждый только свои: поддержать можно,
-- отметиться за другого - нет
create policy prep_vitamins_select on public.prep_vitamins for select to authenticated
  using (public.is_member());
create policy prep_vitamins_insert on public.prep_vitamins for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy prep_vitamins_delete on public.prep_vitamins for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

create policy prep_checks_select on public.prep_checks for select to authenticated
  using (public.is_member());
create policy prep_checks_insert on public.prep_checks for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy prep_checks_update on public.prep_checks for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy prep_checks_delete on public.prep_checks for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Напоминание о витаминах в 12:00 по месту.
--
-- Только тем, кто ими пользуется: хотя бы одна отметка за последнюю неделю.
-- Иначе человек, которому витамины не назначены, получал бы напоминание
-- каждый день и в конце концов выключил бы все уведомления разом.
-- И только пока идёт подготовка.

insert into public.texts (key, lang, value) values
  ('n.prep.vitamins', 'ru', 'Витамины'),
  ('n.prep.vitamins', 'kk', 'Дәрумендер'),
  ('n.prep.vitamins', 'en', 'Vitamins'),
  ('n.prep.vitaminsBody', 'ru', 'Сегодняшние ещё не отмечены. Выпить и отметить - минута.'),
  ('n.prep.vitaminsBody', 'kk', 'Бүгінгісі әлі белгіленбеген. Ішіп, белгілеу - бір минут.'),
  ('n.prep.vitaminsBody', 'en', 'Today''s are not ticked yet. Take them and tick - one minute.')
on conflict (key, lang) do update set value = excluded.value;

create table if not exists public.prep_asks (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.prep_asks enable row level security;
revoke all on public.prep_asks from anon, public;

create policy prep_asks_select on public.prep_asks
  for select to authenticated
  using (public.is_member());

create or replace function public.send_prep_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  person record;
  local_now timestamp;
  today date;
  sent int := 0;
begin
  if not exists (select 1 from public.prep_plan) then
    return 0;
  end if;

  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 12 then
      continue;
    end if;
    if exists (
      select 1 from public.prep_asks a where a.user_id = person.user_id and a.date = today
    ) then
      continue;
    end if;
    insert into public.prep_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;

    if exists (
      select 1 from public.prep_vitamins v where v.user_id = person.user_id and v.date = today
    ) or not exists (
      select 1 from public.prep_vitamins v
       where v.user_id = person.user_id and v.date between today - 7 and today - 1
    ) then
      continue;
    end if;

    perform public.tg_notify_self(
      person.user_id,
      '<b>' || public.tg_escape(public.tx(person.user_id, 'n.prep.vitamins')) || '</b>'
        || E'\n\n' || public.tg_escape(public.tx(person.user_id, 'n.prep.vitaminsBody')),
      'prep');
    perform public.push_notify(
      person.user_id,
      public.tx(person.user_id, 'n.prep.vitamins'),
      public.tx(person.user_id, 'n.prep.vitaminsBody'),
      'prep',
      '/prep'
    );
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.send_prep_reminders() from anon, public;

select cron.schedule('prep-reminders', '0 * * * *', 'select public.send_prep_reminders()');
