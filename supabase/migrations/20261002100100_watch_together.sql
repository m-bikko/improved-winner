-- Смотрим вместе.
--
-- Общий список фильмов и сериалов. Он снимает вечный вопрос «что
-- посмотрим?»: варианты уже записаны, и у каждого видно, кто из двоих
-- его хочет. На расстоянии это ещё и способ смотреть одно и то же.
--
-- После просмотра оба ставят оценку вслепую: оценка второго открывается,
-- когда поставил свою. Иначе вторая оценка всегда подтягивается к первой,
-- и «совпадение вкусов» ничего бы не значило.
--
-- В вишлисте есть категория «Посмотреть» - это другое: там желание
-- на будущее, здесь очередь на ближайшие вечера со статусом и оценками.

create table public.watch_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  kind text not null default 'movie'
    check (kind in ('movie', 'series', 'cartoon', 'documentary', 'other')),
  year smallint check (year is null or year between 1888 and 2100),
  note text check (note is null or length(note) <= 500),
  status text not null default 'want' check (status in ('want', 'watching', 'watched')),
  watched_on date,
  added_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- Дата просмотра есть ровно у просмотренного: иначе «посмотрели» без
  -- даты выпадало бы из истории, а дата у непросмотренного - выдумка
  constraint watch_items_watched_date check ((status = 'watched') = (watched_on is not null))
);

create index watch_items_status on public.watch_items (status, created_at desc);

comment on table public.watch_items is
  'Смотрим вместе: общий список. Правят оба - это общая очередь, а не чьё-то желание.';

-- «Хочу посмотреть» - отдельной строкой на человека. Тот, кто добавил,
-- хочет по определению; второй отмечает сам. Список «хотим оба» и есть
-- ответ на «что сегодня»
create table public.watch_wants (
  item_id uuid not null references public.watch_items on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table public.watch_ratings (
  item_id uuid not null references public.watch_items on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or length(comment) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.watch_items enable row level security;
alter table public.watch_wants enable row level security;
alter table public.watch_ratings enable row level security;
revoke all on public.watch_items from anon;
revoke all on public.watch_wants from anon;
revoke all on public.watch_ratings from anon;

create policy watch_items_select on public.watch_items for select to authenticated
  using (public.is_member());
create policy watch_items_insert on public.watch_items for insert to authenticated
  with check (public.is_member() and added_by = (select auth.uid()));
create policy watch_items_update on public.watch_items for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy watch_items_delete on public.watch_items for delete to authenticated
  using (public.is_member());

create policy watch_wants_select on public.watch_wants for select to authenticated
  using (public.is_member());
create policy watch_wants_insert on public.watch_wants for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy watch_wants_delete on public.watch_wants for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Оценил ли спрашивающий - security definer по той же причине, что
-- у вопроса дня: политика над таблицей, читающая её же, ушла бы в рекурсию
create or replace function public.watch_rated_by_me(item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.watch_ratings r
     where r.item_id = item and r.user_id = (select auth.uid())
  )
$$;

revoke execute on function public.watch_rated_by_me(uuid) from public, anon;
grant execute on function public.watch_rated_by_me(uuid) to authenticated;

create policy watch_ratings_select on public.watch_ratings for select to authenticated
  using (
    public.is_member()
    and (user_id = (select auth.uid()) or public.watch_rated_by_me(item_id))
  );
create policy watch_ratings_insert on public.watch_ratings for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy watch_ratings_update on public.watch_ratings for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy watch_ratings_delete on public.watch_ratings for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Кто уже оценил - без самих оценок. Чтобы экран мог сказать «оценка
-- партнёра ждёт твою», не раскрывая её
create or replace function public.watch_rating_progress()
returns table (item_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.item_id, r.user_id from public.watch_ratings r where public.is_member()
$$;

revoke execute on function public.watch_rating_progress() from public, anon;
grant execute on function public.watch_rating_progress() to authenticated;

-- Оценить можно только просмотренное - и вернуть фильм в «хотим»,
-- пока у него есть оценки, тоже нельзя: оценки повисли бы у непросмотренного
create or replace function public.watch_ratings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.watch_items i where i.id = new.item_id and i.status = 'watched'
  ) then
    raise exception 'watch_ratings_watched_only: оценить можно только просмотренное'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.watch_ratings_guard() from public, anon, authenticated;

create trigger watch_ratings_guard
  before insert or update on public.watch_ratings
  for each row execute function public.watch_ratings_guard();

create or replace function public.watch_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'watched' and exists (
    select 1 from public.watch_ratings r where r.item_id = new.id
  ) then
    raise exception 'watch_items_rated_stays_watched: у фильма уже есть оценки'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.watch_items_guard() from public, anon, authenticated;

create trigger watch_items_guard
  before update of status on public.watch_items
  for each row execute function public.watch_items_guard();

-- ---------------------------------------------------------------------------
-- Уведомления: добавили в список и открылись оценки

insert into public.texts (key, lang, value) values
  ('n.watch.added.male', 'ru', '%1$s добавил в «Смотрим вместе»'),
  ('n.watch.added.female', 'ru', '%1$s добавила в «Смотрим вместе»'),
  ('n.watch.added.other', 'ru', '%1$s добавил(а) в «Смотрим вместе»'),
  ('n.watch.added.male', 'kk', '%1$s «Бірге көреміз» тізіміне қосты'),
  ('n.watch.added.female', 'kk', '%1$s «Бірге көреміз» тізіміне қосты'),
  ('n.watch.added.other', 'kk', '%1$s «Бірге көреміз» тізіміне қосты'),
  ('n.watch.added.male', 'en', '%1$s added to Watch together'),
  ('n.watch.added.female', 'en', '%1$s added to Watch together'),
  ('n.watch.added.other', 'en', '%1$s added to Watch together'),
  ('n.watch.revealed', 'ru', 'Оценки открыты'),
  ('n.watch.revealed', 'kk', 'Бағалар ашылды'),
  ('n.watch.revealed', 'en', 'Ratings are in'),
  ('n.watch.revealedBody', 'ru', '«%1$s» - посмотрите, совпали ли вкусы.'),
  ('n.watch.revealedBody', 'kk', '«%1$s» - талғамдарың сәйкес келді ме, қараңдар.'),
  ('n.watch.revealedBody', 'en', '“%1$s” - see whether your tastes match.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_watch_item()
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
  target := public.partner_of(new.added_by);
  if target is null then
    return new;
  end if;
  title := public.tx_by(target, new.added_by, 'n.watch.added', public.nick_for(target, new.added_by));
  body := new.title || coalesce(' (' || new.year || ')', '');
  perform public.tg_notify_partner(
    new.added_by,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'watch');
  perform public.push_notify(target, title, body, 'watch', '/watch');
  return new;
end;
$$;

revoke execute on function public.tg_on_watch_item() from public, anon, authenticated;

create trigger watch_items_notify
  after insert on public.watch_items
  for each row execute function public.tg_on_watch_item();

-- Только вторая оценка: первая сама по себе - не событие, о ней второй
-- узнает на экране («оценка ждёт твою»)
create or replace function public.tg_on_watch_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  film text;
  title text;
  body text;
begin
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;
  if not exists (
    select 1 from public.watch_ratings r where r.item_id = new.item_id and r.user_id = target
  ) then
    return new;
  end if;
  select i.title into film from public.watch_items i where i.id = new.item_id;
  title := public.tx(target, 'n.watch.revealed');
  body := public.tx(target, 'n.watch.revealedBody', film);
  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'watch');
  perform public.push_notify(target, title, body, 'watch', '/watch');
  return new;
end;
$$;

revoke execute on function public.tg_on_watch_rating() from public, anon, authenticated;

create trigger watch_ratings_notify
  after insert on public.watch_ratings
  for each row execute function public.tg_on_watch_rating();
