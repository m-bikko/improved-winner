-- Схема Love-promises: контур доступа, продукты/блюда, дневник, профиль, темы.

-- ---------------------------------------------------------------------------
-- Служебное
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_members - контур доступа
--
-- Проект приватный, аккаунтов ровно два. Публичная регистрация выключена, но это
-- настройка платформы, а не инвариант базы: членство в этой таблице - второй рубеж,
-- который переживёт случайное включение регистрации обратно.
-- ---------------------------------------------------------------------------

create table public.app_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- security definer, потому что на самой app_members включён RLS: политика, которая
-- вызывает эту функцию, иначе ушла бы в бесконечную рекурсию по собственной таблице.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_members m where m.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- foods - продукты И блюда в одной таблице
--
-- Единая сущность, а не две параллельные: так поиск, пикер в дневнике и запись
-- работают над одним типом, без дублирования кода на каждой ветке.
-- Для kind='dish' колонки КБЖУ не используются - их считает вью foods_v.
-- ---------------------------------------------------------------------------

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('product', 'dish')),
  name text not null check (length(btrim(name)) > 0),
  brand text,

  kcal_100 numeric(7, 2) not null default 0 check (kcal_100 between 0 and 900),
  protein_100 numeric(7, 2) not null default 0 check (protein_100 between 0 and 100),
  fat_100 numeric(7, 2) not null default 0 check (fat_100 between 0 and 100),
  carbs_100 numeric(7, 2) not null default 0 check (carbs_100 between 0 and 100),

  -- готовый вес блюда после приготовления: борщ теряет воду, крупа набирает.
  -- null => берём сумму граммовок ингредиентов
  yield_grams numeric(8, 2) check (yield_grams > 0),

  -- Нормализованное имя для поиска: lower + ё→е.
  -- concat_ws здесь использовать нельзя - она STABLE, а generated-колонка требует
  -- IMMUTABLE. Оператор || и coalesce оба immutable.
  name_norm text generated always as (
    lower(translate(name || ' ' || coalesce(brand, ''), 'ёЁ', 'еЕ'))
  ) stored,

  -- Архивация вместо удаления: история дневника остаётся связной
  archived_at timestamptz,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- цель - дать составным FK в dish_items на что ссылаться
  constraint foods_id_kind_key unique (id, kind),
  constraint foods_yield_only_for_dish check (kind = 'dish' or yield_grams is null)
);

create index foods_name_norm_trgm_idx
  on public.foods using gin (name_norm extensions.gin_trgm_ops);

create index foods_kind_active_idx
  on public.foods (kind, name) where archived_at is null;

create trigger foods_touch before update on public.foods
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- food_servings - готовые меры
--
-- «1 яйцо = 60 г», «1 тарелка = 350 г», «100 мл = 103 г». Главный ускоритель ввода
-- на телефоне: без них каждый раз пришлось бы прикидывать граммы на глаз.
-- Работает и для продуктов, и для блюд.
-- ---------------------------------------------------------------------------

create table public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  grams numeric(8, 2) not null check (grams > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint food_servings_unique_label unique (food_id, label)
);

create index food_servings_food_idx on public.food_servings (food_id, sort_order);

-- ---------------------------------------------------------------------------
-- dish_items - состав блюда
--
-- В v1 блюдо НЕ может быть ингредиентом другого блюда. Это закрывает целый класс
-- проблем (цикл борщ → бульон → борщ) и покрывает почти все реальные сценарии.
--
-- Инвариант держит база, а не приложение: константные generated-колонки
-- dish_kind/item_kind входят в составные FK на foods(id, kind), поэтому вставить
-- блюдо в качестве ингредиента физически невозможно.
-- ---------------------------------------------------------------------------

create table public.dish_items (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null,
  food_id uuid not null,
  grams numeric(8, 2) not null check (grams > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  dish_kind text not null generated always as ('dish') stored,
  item_kind text not null generated always as ('product') stored,

  constraint dish_items_dish_fk foreign key (dish_id, dish_kind)
    references public.foods (id, kind) on delete cascade,
  constraint dish_items_food_fk foreign key (food_id, item_kind)
    references public.foods (id, kind) on delete restrict,

  constraint dish_items_no_self check (dish_id <> food_id),
  constraint dish_items_unique unique (dish_id, food_id)
);

create index dish_items_dish_idx on public.dish_items (dish_id, sort_order);
create index dish_items_food_idx on public.dish_items (food_id);

-- ---------------------------------------------------------------------------
-- diary_entries - записи дневника
--
-- Два ключевых решения:
--
-- 1. id генерирует КЛИЕНТ. Нужно для офлайн-очереди: повторная отправка одной
--    и той же записи идемпотентна, дублей не будет.
--
-- 2. Снимок КБЖУ хранится НА 100 Г, а не абсолютом за порцию. Если хранить абсолют,
--    то поправить граммовку задним числом («было 150, стало 200») можно только сходив
--    в живой продукт - а он мог измениться, и история поедет ровно там, где мы её
--    защищали. При снимке на 100 г правка граммовки корректна, а generated-колонки
--    дают готовые суммы за порцию.
--
-- date передаёт клиент. Никаких default current_date: часовой пояс базы - UTC,
-- и еда в 21:00 по Алматы уехала бы на завтра.
-- ---------------------------------------------------------------------------

create table public.diary_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.foods (id) on delete set null,
  grams numeric(8, 2) not null check (grams > 0),

  name_snapshot text not null check (length(btrim(name_snapshot)) > 0),
  brand_snapshot text,
  serving_label_snapshot text,
  kcal_100 numeric(7, 2) not null check (kcal_100 >= 0),
  protein_100 numeric(7, 2) not null check (protein_100 >= 0),
  fat_100 numeric(7, 2) not null check (fat_100 >= 0),
  carbs_100 numeric(7, 2) not null check (carbs_100 >= 0),

  kcal numeric(9, 2) generated always as (round(grams * kcal_100 / 100, 2)) stored,
  protein numeric(9, 2) generated always as (round(grams * protein_100 / 100, 2)) stored,
  fat numeric(9, 2) generated always as (round(grams * fat_100 / 100, 2)) stored,
  carbs numeric(9, 2) generated always as (round(grams * carbs_100 / 100, 2)) stored,

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- самый горячий запрос приложения: день одного пользователя
create index diary_entries_user_date_idx on public.diary_entries (user_id, date);

-- для списков «Недавние» и «Часто» в шторке поиска
create index diary_entries_recent_idx
  on public.diary_entries (user_id, created_at desc) where food_id is not null;

create trigger diary_entries_touch before update on public.diary_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- weight_log - история веса
--
-- Одна таблица, а взамен график динамики. profiles.weight_kg становится
-- «последним значением» и нужен только для расчёта целей.
-- ---------------------------------------------------------------------------

create table public.weight_log (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- profiles
--
-- goals_mode разделяет авто- и ручные цели. Без него: пользователь переопределил
-- цель руками, потом изменил вес - и значение либо молча затрётся, либо навсегда
-- застынет. При 'auto' цели считаются на лету по Mifflin-St Jeor на клиенте.
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (length(btrim(nickname)) > 0),

  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('male', 'female')),
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  weight_kg numeric(5, 2) check (weight_kg between 20 and 400),

  activity_level text not null default 'moderate'
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal_direction text not null default 'maintain'
    check (goal_direction in ('lose', 'maintain', 'gain')),

  goals_mode text not null default 'auto' check (goals_mode in ('auto', 'manual')),
  goal_kcal numeric(7, 2) check (goal_kcal > 0),
  goal_protein numeric(7, 2) check (goal_protein >= 0),
  goal_fat numeric(7, 2) check (goal_fat >= 0),
  goal_carbs numeric(7, 2) check (goal_carbs >= 0),

  -- нужен, чтобы серверные агрегаты (если появятся) считали день так же, как клиент
  timezone text not null default 'Asia/Almaty',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_manual_goals_complete check (
    goals_mode = 'auto' or goal_kcal is not null
  )
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- topics - канбан тем
--
-- Консистентность статуса гарантирует табличный CHECK, а не клиент: валидация
-- только в UI развалится при первом же ручном апдейте или баге в форме.
-- ---------------------------------------------------------------------------

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  body text,
  status text not null default 'open' check (status in ('open', 'closed')),
  resolution text,

  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,

  -- regconfig указан с явной схемой: без неё выражение зависит от search_path
  -- и Postgres не считает его immutable, а generated-колонка этого требует
  search_tsv tsvector generated always as (
    to_tsvector(
      'pg_catalog.russian'::regconfig,
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(resolution, '')
    )
  ) stored,

  constraint topics_status_consistent check (
    (status = 'open'
      and resolution is null and closed_at is null and closed_by is null)
    or
    (status = 'closed'
      and length(btrim(resolution)) > 0 and closed_at is not null and closed_by is not null)
  )
);

create index topics_search_idx on public.topics using gin (search_tsv);
create index topics_status_idx on public.topics (status, created_at desc);

create trigger topics_touch before update on public.topics
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- topic_comments
--
-- Для тем между двумя людьми переписка внутри темы - и есть основная ценность;
-- одного поля «как решили» на карточке для этого мало.
-- ---------------------------------------------------------------------------

create table public.topic_comments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index topic_comments_topic_idx on public.topic_comments (topic_id, created_at);
