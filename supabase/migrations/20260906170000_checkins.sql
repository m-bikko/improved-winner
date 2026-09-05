-- Ежедневный опрос: как настроение и самочувствие.
--
-- Видят ОБА - это главное отличие от раздела цикла. Здесь так и задумано:
-- вопрос «как ты сегодня» имеет смысл ровно потому, что ответ увидит второй.
-- Правило то же, что у дневника питания: читают оба, пишет каждый своё.
--
-- Состояния - закрытый словарь, проверяемый базой. Свободный текст означал бы,
-- что «грустно», «Грустно» и «грусть» - три разных состояния, и никакая
-- статистика по ним потом не сложится. Словарь тот же и в интерфейсе:
-- предлагать то, что база откажется принять, нельзя.

create table public.checkins (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  states text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, date),

  constraint checkins_states_known check (
    states <@ array[
      -- настроение
      'joy','sad','calm','anxious','irritated','inlove','bored','inspired',
      'angry','lost','grateful','lonely','proud','guilty',
      -- энергия
      'energetic','sleepy','exhausted','strong','broken','secondwind',
      -- тело
      'headache','stomach','nausea','sore','sick','back','healthy','poop',
      'hungry','stuffed','thirsty','cold','hot','pms','period',
      -- про нас
      'miss','wantmeet','wanthug','needtalk','allgoodus',
      -- дела
      'swamped','free','onroad','training','working','resting'
    ]::text[]
  ),

  -- Пустая отметка - это не «день без состояний», это мусор: она неотличима
  -- от случайного тапа и показывала бы партнёру пустую карточку.
  constraint checkins_not_empty check (
    cardinality(states) > 0 or (note is not null and length(btrim(note)) > 0)
  )
);

create index checkins_date on public.checkins (date desc);

create table public.checkin_asks (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.checkins enable row level security;
alter table public.checkin_asks enable row level security;
revoke all on public.checkins from anon;
revoke all on public.checkin_asks from anon, authenticated;

-- Читают оба, пишет каждый только своё - как в дневнике питания
create policy checkins_select on public.checkins for select to authenticated
  using (public.is_member());

create policy checkins_insert on public.checkins for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));

create policy checkins_update on public.checkins for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy checkins_delete on public.checkins for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Вопрос в 11:00 по поясу профиля.
--
-- Спрашиваем только тех, кто сегодня ещё не ответил: напоминать человеку
-- о том, что он уже сделал, - самый быстрый способ приучить не читать
-- уведомления вовсе.

create or replace function public.ask_checkins()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  local_now timestamp;
  today date;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 11 then
      continue;
    end if;

    if exists (
      select 1 from public.checkin_asks a
       where a.user_id = person.user_id and a.date = today
    ) then
      continue;
    end if;

    -- Уже ответил - молчим
    if exists (
      select 1 from public.checkins c
       where c.user_id = person.user_id and c.date = today
    ) then
      insert into public.checkin_asks (user_id, date) values (person.user_id, today)
      on conflict do nothing;
      continue;
    end if;

    perform public.tg_notify_self(
      person.user_id,
      '<b>Как ты сегодня?</b>' || E'\n\n'
        || 'Настроение, самочувствие, что угодно. Партнёр увидит.'
    );
    perform public.push_notify(
      person.user_id,
      'Как ты сегодня?',
      'Настроение и самочувствие - партнёр увидит'
    );

    insert into public.checkin_asks (user_id, date) values (person.user_id, today)
    on conflict do nothing;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.ask_checkins() from public, anon, authenticated;

select cron.schedule('checkin-asks', '0 * * * *', $$ select public.ask_checkins() $$);
