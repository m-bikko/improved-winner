-- Имя для малыша.
--
-- Каждый сам листает имена и отмечает «нравится» или «нет». Имя всплывает,
-- только когда понравилось обоим. Чужие голоса не видны вовсе - ни «да»,
-- ни тем более «нет»: спорить не о чем, а отказ второго не ранит, потому
-- что о нём никто не узнает.
--
-- Имена - в базе, а не в словарях приложения: это данные, а не текст
-- интерфейса (имя не переводится), и уведомлению о совпадении нужно знать,
-- какое имя совпало. Значение имени - на трёх языках, если оно известно.

create table public.baby_names (
  key text primary key check (key ~ '^[a-z0-9_-]{1,60}$'),
  name text not null check (length(btrim(name)) between 1 and 40),
  latin text check (latin is null or length(btrim(latin)) between 1 and 40),
  gender text not null check (gender in ('m', 'f', 'u')),
  origin text not null check (origin in ('kazakh', 'slavic', 'intl', 'custom')),
  meaning_ru text check (meaning_ru is null or length(meaning_ru) <= 60),
  meaning_en text check (meaning_en is null or length(meaning_en) <= 60),
  meaning_kk text check (meaning_kk is null or length(meaning_kk) <= 60),
  -- Своё имя, добавленное одним из двоих. У имён из списка - пусто
  created_by uuid references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint baby_names_custom check ((origin = 'custom') = (created_by is not null))
);

-- Одно имя - одна строка, как бы его ни набрали
create unique index baby_names_unique_name on public.baby_names (lower(btrim(name)), gender);

create table public.name_votes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name_key text not null references public.baby_names on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, name_key)
);

alter table public.baby_names enable row level security;
alter table public.name_votes enable row level security;
revoke all on public.baby_names from anon;
revoke all on public.name_votes from anon;

create policy baby_names_select on public.baby_names for select to authenticated using (public.is_member());
create policy baby_names_insert on public.baby_names for insert to authenticated
  with check (public.is_member() and origin = 'custom' and created_by = (select auth.uid()));
create policy baby_names_delete on public.baby_names for delete to authenticated
  using (public.is_member() and created_by = (select auth.uid()));

-- Свои голоса - и только свои. Чужие не видны совсем
create policy name_votes_select on public.name_votes for select to authenticated
  using (public.is_member() and user_id = (select auth.uid()));
create policy name_votes_insert on public.name_votes for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy name_votes_update on public.name_votes for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy name_votes_delete on public.name_votes for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Совпадения: имена, которые понравились обоим. Единственное, что известно
-- о голосах второго, - и только когда они совпали со своими
create or replace function public.name_matches()
returns table (name_key text, matched_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.name_key, max(greatest(v.updated_at, w.updated_at))
    from public.name_votes v
    join public.name_votes w on w.name_key = v.name_key and w.user_id <> v.user_id and w.liked
   where public.is_member()
     and v.user_id = (select auth.uid())
     and v.liked
   group by v.name_key
$$;

revoke execute on function public.name_matches() from public, anon;
grant execute on function public.name_matches() to authenticated;

-- ---------------------------------------------------------------------------
-- Уведомление о совпадении - второму: тот, кто только что отметил, видит
-- совпадение сам

insert into public.texts (key, lang, value) values
  ('n.names.match', 'ru', 'Совпадение в именах'),
  ('n.names.match', 'kk', 'Есімдер сәйкес келді'),
  ('n.names.match', 'en', 'A name you both like'),
  ('n.names.matchBody', 'ru', '%1$s - нравится вам обоим.'),
  ('n.names.matchBody', 'kk', '%1$s - екеуіңе де ұнайды.'),
  ('n.names.matchBody', 'en', '%1$s - you both like it.')
on conflict (key, lang) do update set value = excluded.value;

-- Время голоса - момента последнего решения: по нему сортируются совпадения
create or replace function public.name_votes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger name_votes_touch
  before update on public.name_votes
  for each row execute function public.name_votes_touch();

create or replace function public.tg_on_name_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  shown text;
begin
  if not new.liked or (tg_op = 'UPDATE' and old.liked) then
    return new;
  end if;
  target := public.partner_of(new.user_id);
  if target is null or not exists (
    select 1 from public.name_votes w where w.user_id = target and w.name_key = new.name_key and w.liked
  ) then
    return new;
  end if;
  select n.name into shown from public.baby_names n where n.key = new.name_key;
  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(public.tx(target, 'n.names.match')) || '</b>' || E'\n\n'
      || public.tg_escape(public.tx(target, 'n.names.matchBody', shown)),
    'names');
  perform public.push_notify(
    target,
    public.tx(target, 'n.names.match'),
    public.tx(target, 'n.names.matchBody', shown),
    'names',
    '/names');
  return new;
end;
$$;

revoke execute on function public.tg_on_name_match() from public, anon, authenticated;

create trigger name_votes_match
  after insert or update of liked on public.name_votes
  for each row execute function public.tg_on_name_match();
