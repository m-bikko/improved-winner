-- Кадр дня.
--
-- Раз в день в случайный момент обоим приходит сигнал: десять минут, чтобы
-- снять то, что вокруг. Кадр второго открывается, только когда снял сам, -
-- иначе это был бы просмотр чужого дня, а не обмен. На расстоянии это
-- способ увидеть, где сейчас другой, без постановки: момент выбирает не он.
--
-- Время сигнала выбирает база и заранее его не показывает: строка дня
-- видна только после отправки. Снять можно и позже, но в течение суток
-- после сигнала; опоздание видно («+12 мин»). Когда сутки прошли, снимать
-- уже нельзя, и слепота теряет смысл - тогда кадр второго открыт всем.
--
-- Снимки - те же три размера, что у воспоминаний: полный, превью и заглушка
-- в строке. Отдельный бакет, потому что у него другое правило чтения:
-- файл второго закрыт, пока строка закрыта.

-- Новые виды уведомлений этой серии - разом
alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters',
    'nudge', 'gratitude', 'weigh_in', 'updates',
    'question', 'watch', 'prep', 'memories', 'challenges', 'savings',
    'meetings', 'voice', 'quiz', 'names', 'pregnancy', 'pulse',
    'shots', 'ideas', 'pause', 'week', 'meds'
  ));

create table public.shot_prompts (
  day date primary key,
  fire_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.shot_prompts is
  'Сигнал кадра дня: когда приходит. Видна только после отправки - время заранее не узнать.';

create table public.shots (
  -- Id даёт клиент: путь файла строится от него, а строка вставляется
  -- после загрузки
  id uuid primary key,
  day date not null references public.shot_prompts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  path text not null unique,
  thumb_path text not null unique,
  width int not null check (width between 1 and 4096),
  height int not null check (height between 1 and 4096),
  placeholder text not null check (placeholder like 'data:image/%' and length(placeholder) <= 3000),
  caption text check (caption is null or length(btrim(caption)) between 1 and 140),
  created_at timestamptz not null default now(),
  constraint shots_one_per_day unique (user_id, day)
);

create index shots_day on public.shots (day desc);

comment on table public.shots is
  'Кадры дня. Чужой виден после своего за тот же день или когда сутки после сигнала прошли.';

alter table public.shot_prompts enable row level security;
alter table public.shots enable row level security;
revoke all on public.shot_prompts from anon;
revoke all on public.shots from anon;

-- Сигнал читается только отправленным. Писать его может только база
create policy shot_prompts_select on public.shot_prompts for select to authenticated
  using (public.is_member() and sent_at is not null);

-- Видно ли кадры второго за этот день: снял сам или снимать уже поздно
create or replace function public.shot_open(of_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.shots s where s.user_id = (select auth.uid()) and s.day = of_day
    )
    or exists (
      select 1 from public.shot_prompts p
       where p.day = of_day and p.sent_at is not null and p.sent_at + interval '24 hours' < now()
    )
$$;

revoke execute on function public.shot_open(date) from public, anon;
grant execute on function public.shot_open(date) to authenticated;

create policy shots_select on public.shots for select to authenticated
  using (public.is_member() and (user_id = (select auth.uid()) or public.shot_open(day)));
-- Снимать - после сигнала и не позже суток после него
create policy shots_insert on public.shots for insert to authenticated
  with check (
    public.is_member() and user_id = (select auth.uid()) and exists (
      select 1 from public.shot_prompts p
       where p.day = shots.day and p.sent_at is not null and now() < p.sent_at + interval '24 hours'
    )
  );
-- Своё можно убрать всегда: это фотография человека, а не запись в журнале
create policy shots_delete on public.shots for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Кто уже снял - без самих кадров: «второй уже снял, твой ход»
create or replace function public.shot_progress()
returns table (day date, user_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.day, s.user_id, s.created_at from public.shots s
   where public.is_member() and s.created_at > now() - interval '62 days'
$$;

revoke execute on function public.shot_progress() from public, anon;
grant execute on function public.shot_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- Хранилище. 600 КБ, как у воспоминаний: полный снимок 1600 px в WebP

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shots', 'shots', false, 614400, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Файл второго читается по тому же правилу, что строка. Иначе строку
-- закрыли бы, а папку второго можно было бы просто перечислить
create or replace function public.shot_file_open(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shots s
     where (s.path = object_name or s.thumb_path = object_name)
       and public.shot_open(s.day)
  )
$$;

revoke execute on function public.shot_file_open(text) from public, anon;
grant execute on function public.shot_file_open(text) to authenticated;

create policy shots_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shots' and public.is_member()
    and (owner_id = (select auth.uid())::text or public.shot_file_open(name))
  );

-- Класть - только в свою папку
create policy shots_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shots' and public.is_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy shots_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'shots' and public.is_member() and owner_id = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Тексты

insert into public.texts (key, lang, value) values
  ('n.shot.prompt', 'ru', 'Кадр дня'),
  ('n.shot.prompt', 'kk', 'Күн кадры'),
  ('n.shot.prompt', 'en', 'Shot of the day'),
  ('n.shot.promptBody', 'ru', '10 минут, чтобы показать, что вокруг. Кадр второго откроется после твоего.'),
  ('n.shot.promptBody', 'kk', 'Айналаңда не бар екенін көрсетуге 10 минут. Екіншісінің кадры сенікінен кейін ашылады.'),
  ('n.shot.promptBody', 'en', '10 minutes to show what is around you. The other shot opens after yours.'),
  ('n.shot.posted.male', 'ru', '%1$s снял кадр дня'),
  ('n.shot.posted.female', 'ru', '%1$s сняла кадр дня'),
  ('n.shot.posted.other', 'ru', '%1$s: кадр дня готов'),
  ('n.shot.posted.male', 'kk', '%1$s күн кадрын түсірді'),
  ('n.shot.posted.female', 'kk', '%1$s күн кадрын түсірді'),
  ('n.shot.posted.other', 'kk', '%1$s күн кадрын түсірді'),
  ('n.shot.posted.male', 'en', '%1$s took the shot of the day'),
  ('n.shot.posted.female', 'en', '%1$s took the shot of the day'),
  ('n.shot.posted.other', 'en', '%1$s took the shot of the day'),
  ('n.shot.postedBody', 'ru', 'Сними свой - и откроются оба.'),
  ('n.shot.postedBody', 'kk', 'Өзіңдікін түсір - екеуі де ашылады.'),
  ('n.shot.postedBody', 'en', 'Take yours and both will open.'),
  ('n.shot.revealed.male', 'ru', '%1$s тоже снял кадр дня'),
  ('n.shot.revealed.female', 'ru', '%1$s тоже сняла кадр дня'),
  ('n.shot.revealed.other', 'ru', '%1$s: кадр дня тоже готов'),
  ('n.shot.revealed.male', 'kk', '%1$s да күн кадрын түсірді'),
  ('n.shot.revealed.female', 'kk', '%1$s да күн кадрын түсірді'),
  ('n.shot.revealed.other', 'kk', '%1$s да күн кадрын түсірді'),
  ('n.shot.revealed.male', 'en', '%1$s took the shot of the day too'),
  ('n.shot.revealed.female', 'en', '%1$s took the shot of the day too'),
  ('n.shot.revealed.other', 'en', '%1$s took the shot of the day too'),
  ('n.shot.revealedBody', 'ru', 'Оба кадра открыты - посмотрите, где сейчас другой.'),
  ('n.shot.revealedBody', 'kk', 'Екі кадр да ашық - екіншісінің қазір қайда екенін қараңдар.'),
  ('n.shot.revealedBody', 'en', 'Both shots are open: see where the other one is right now.')
on conflict (key, lang) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Второму: снял первым - «твой ход», снял вторым - «оба открыты»

create or replace function public.tg_on_shot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  title text;
  body text;
begin
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;
  if exists (select 1 from public.shots s where s.user_id = target and s.day = new.day) then
    title := public.tx_by(target, new.user_id, 'n.shot.revealed', public.nick_for(target, new.user_id));
    body := public.tx(target, 'n.shot.revealedBody');
  else
    title := public.tx_by(target, new.user_id, 'n.shot.posted', public.nick_for(target, new.user_id));
    body := public.tx(target, 'n.shot.postedBody');
  end if;
  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'shots');
  perform public.push_notify(target, title, body, 'shots', '/shots');
  return new;
end;
$$;

revoke execute on function public.tg_on_shot() from public, anon, authenticated;

create trigger shots_notify after insert on public.shots
  for each row execute function public.tg_on_shot();

-- ---------------------------------------------------------------------------
-- Расписание.
--
-- День пары - по поясу первого участника. Окно - с 10 до 21 по местному
-- времени ОБОИХ: если пояса разные, берётся пересечение, чтобы сигнал
-- не пришёл одному ночью. Пересечения нет - окно первого.
--
-- В полночь (первый прогон дня) момент выбирается случайно и записывается;
-- дальше каждые пять минут проверяется, не пора ли. Если строка дня
-- создаётся посреди окна (первый день после выкладки), окно начинается
-- с текущего момента. Сигнал, который проспали дольше двух часов (база
-- была недоступна), не рассылается, а открывается молча - иначе он пришёл
-- бы ночью.
--
-- `at` - для проверки: «что сделал бы прогон в такой-то момент».

create or replace function public.shot_tick(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  d date;
  lo timestamptz;
  hi timestamptz;
  m record;
  p record;
  sent int := 0;
begin
  select coalesce(pr.timezone, 'Asia/Almaty') into tz
    from public.app_members am
    join public.profiles pr on pr.user_id = am.user_id
   order by am.user_id
   limit 1;
  if tz is null then
    return 0;
  end if;
  d := (at at time zone tz)::date;

  if not exists (select 1 from public.shot_prompts sp where sp.day = d) then
    lo := (d + time '10:00') at time zone tz;
    hi := (d + time '21:00') at time zone tz;
    for m in
      select coalesce(pr.timezone, 'Asia/Almaty') as tz
        from public.app_members am
        join public.profiles pr on pr.user_id = am.user_id
    loop
      lo := greatest(lo, (d + time '10:00') at time zone m.tz);
      hi := least(hi, (d + time '21:00') at time zone m.tz);
    end loop;
    if lo >= hi then
      lo := (d + time '10:00') at time zone tz;
      hi := (d + time '21:00') at time zone tz;
    end if;
    lo := greatest(lo, at);
    if lo < hi then
      insert into public.shot_prompts (day, fire_at)
      values (d, lo + random() * (hi - lo))
      on conflict do nothing;
    end if;
  end if;

  for p in
    select sp.day, sp.fire_at from public.shot_prompts sp
     where sp.sent_at is null and sp.fire_at <= at
     order by sp.day
  loop
    update public.shot_prompts set sent_at = at where day = p.day;
    if p.fire_at < at - interval '2 hours' then
      continue;
    end if;
    for m in select am.user_id from public.app_members am loop
      perform public.tg_notify_self(
        m.user_id,
        '<b>' || public.tg_escape(public.tx(m.user_id, 'n.shot.prompt')) || '</b>'
          || E'\n\n' || public.tg_escape(public.tx(m.user_id, 'n.shot.promptBody')),
        'shots');
      perform public.push_notify(
        m.user_id,
        public.tx(m.user_id, 'n.shot.prompt'),
        public.tx(m.user_id, 'n.shot.promptBody'),
        'shots',
        '/shots');
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.shot_tick(timestamptz) from public, anon, authenticated;

select cron.schedule('shot-tick', '*/5 * * * *', 'select public.shot_tick()');
