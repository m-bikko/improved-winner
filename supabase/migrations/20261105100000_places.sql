-- Места, куда хотим сходить.
--
-- Общий список пары с точками на карте OpenStreetMap: кофейня, парк, город
-- на выходные. Добавить и поправить может любой из двоих - список общий,
-- как темы и встречи, а не как вишлист, где у желания есть хозяин.
--
-- Точка обязательна. Раздел устроен вокруг карты, и у места без координат
-- в нём нет своего угла; если геокодер места не знает, точку ставят нажатием
-- на карту. Поэтому и нет двух путей - «с точкой» и «без».
--
-- Одна точка - одно место: оба могут найти один и тот же парк, и список
-- не должен об этом узнавать дублем. Сравнение до пятого знака, это около
-- метра: рядом стоящие кофейни так разделяются, а один результат геокодера
-- дважды - нет.
--
-- Побывали - отметка visited_on, дату задаёт клиент (см. time-and-dates).
-- Строка остаётся: «где мы уже были» на карте не менее интересно, чем «куда
-- хотим». Воспоминание, если его записали, живёт отдельно и переживает снятие
-- отметки, поэтому связь рвётся только у места, а не у воспоминания.

alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters',
    'nudge', 'gratitude', 'weigh_in', 'updates',
    'question', 'watch', 'prep', 'memories', 'challenges', 'savings',
    'meetings', 'voice', 'quiz', 'names', 'pregnancy', 'pulse',
    'shots', 'ideas', 'pause', 'week', 'meds', 'places'
  ));

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other',
  note text,
  address text,
  lat double precision not null,
  lng double precision not null,
  visited_on date,
  memory_id uuid references public.memories on delete set null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint places_name check (length(btrim(name)) between 1 and 120),
  constraint places_kind check (kind in ('food', 'nature', 'culture', 'fun', 'trip', 'other')),
  constraint places_note check (note is null or length(btrim(note)) between 1 and 500),
  constraint places_address check (address is null or length(btrim(address)) between 1 and 300),
  -- NaN в Postgres больше любого числа, так что between отсекает и его
  constraint places_lat check (lat between -90 and 90),
  constraint places_lng check (lng between -180 and 180),
  constraint places_memory_needs_visit check (memory_id is null or visited_on is not null)
);

comment on table public.places is
  'Места, куда пара хочет сходить, и где уже была. Точка на карте обязательна.';

create unique index places_same_point
  on public.places ((round(lat::numeric, 5)), (round(lng::numeric, 5)));

alter table public.places enable row level security;
revoke all on public.places from anon;

create policy places_select on public.places for select to authenticated
  using (public.is_member());
create policy places_insert on public.places for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy places_update on public.places for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy places_delete on public.places for delete to authenticated
  using (public.is_member());

-- Кто добавил и когда - факт, а не поле для правки
revoke update on public.places from authenticated;
grant update (name, kind, note, address, lat, lng, visited_on, memory_id) on public.places to authenticated;

-- ---------------------------------------------------------------------------
-- Уведомление второму: появилось новое место, и какое

insert into public.texts (key, lang, value) values
  ('n.places.added', 'ru', '%1$s: новое место'),
  ('n.places.added', 'kk', '%1$s: жаңа орын'),
  ('n.places.added', 'en', '%1$s: a new place')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  title text;
begin
  target := public.partner_of(new.created_by);
  if target is null then
    return new;
  end if;
  title := public.tx(target, 'n.places.added', public.nick_for(target, new.created_by));
  perform public.tg_notify_partner(
    new.created_by,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(new.name),
    'places');
  perform public.push_notify(target, title, new.name, 'places', '/places');
  return new;
end;
$$;

revoke execute on function public.tg_on_place() from public, anon, authenticated;

create trigger places_notify
  after insert on public.places
  for each row execute function public.tg_on_place();
