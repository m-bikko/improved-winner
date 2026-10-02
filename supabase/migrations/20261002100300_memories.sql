-- Лента воспоминаний.
--
-- Общий альбом пары: снимки с подписью, датой и местом от любого из двоих.
-- Пока живёте порознь, это ещё и способ показать свой день - и то, к чему
-- потом возвращаются: экран «В этот день» поднимает то, что было год назад.
--
-- Фото хранится в двух размерах - полный для просмотра и превью для ленты -
-- плюс крошечная заглушка прямо в строке. Лента рисуется сразу размытыми
-- заглушками нужных пропорций, превью подгружаются по мере прокрутки,
-- а полный снимок качается только при открытии. Подробно - wiki, photos.

create table public.memories (
  -- Id даёт клиент: путь фото в бакете строится от него, а фото грузятся
  -- уже после того, как запись есть. Тот же приём, что у писем
  id uuid primary key,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  happened_on date not null,
  caption text check (caption is null or length(caption) <= 1000),
  place text check (place is null or length(btrim(place)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memories_happened on public.memories (happened_on desc, created_at desc);

comment on table public.memories is
  'Воспоминания: подпись, дата, место. Фото - в memory_photos, видят оба, правит автор.';

create table public.memory_photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories on delete cascade,
  path text not null unique,
  thumb_path text not null unique,
  width int not null check (width between 1 and 4096),
  height int not null check (height between 1 and 4096),
  -- Заглушка в 16 пикселей как data URL, около полукилобайта. В строке,
  -- а не файлом: рисуется до первого запроса к хранилищу
  placeholder text not null
    check (placeholder like 'data:image/%' and length(placeholder) <= 3000),
  position smallint not null default 0 check (position between 0 and 11),
  created_at timestamptz not null default now()
);

create index memory_photos_memory on public.memory_photos (memory_id, position);

-- Сердечко от второго. Ни комментариев, ни счётчиков лайков: людей двое,
-- и «понравилось» - это одно сердце, а не рейтинг
create table public.memory_hearts (
  memory_id uuid not null references public.memories on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

alter table public.memories enable row level security;
alter table public.memory_photos enable row level security;
alter table public.memory_hearts enable row level security;
revoke all on public.memories from anon;
revoke all on public.memory_photos from anon;
revoke all on public.memory_hearts from anon;

create policy memories_select on public.memories for select to authenticated
  using (public.is_member());
create policy memories_insert on public.memories for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));
create policy memories_update on public.memories for update to authenticated
  using (public.is_member() and author_id = (select auth.uid()))
  with check (public.is_member() and author_id = (select auth.uid()));
create policy memories_delete on public.memories for delete to authenticated
  using (public.is_member() and author_id = (select auth.uid()));

-- Фото правит автор воспоминания - через его строку, а не через свою колонку:
-- снимок не живёт отдельно от записи
create policy memory_photos_select on public.memory_photos for select to authenticated
  using (public.is_member());
create policy memory_photos_insert on public.memory_photos for insert to authenticated
  with check (
    public.is_member() and exists (
      select 1 from public.memories m
       where m.id = memory_id and m.author_id = (select auth.uid())
    )
  );
create policy memory_photos_update on public.memory_photos for update to authenticated
  using (
    public.is_member() and exists (
      select 1 from public.memories m
       where m.id = memory_id and m.author_id = (select auth.uid())
    )
  );
create policy memory_photos_delete on public.memory_photos for delete to authenticated
  using (
    public.is_member() and exists (
      select 1 from public.memories m
       where m.id = memory_id and m.author_id = (select auth.uid())
    )
  );

create policy memory_hearts_select on public.memory_hearts for select to authenticated
  using (public.is_member());
create policy memory_hearts_insert on public.memory_hearts for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy memory_hearts_delete on public.memory_hearts for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- Не больше двенадцати фото в одном воспоминании. Мозаика в ленте всё
-- равно показывает четыре и «ещё N», а сотня снимков одного дня - это
-- уже альбом, а не воспоминание
create or replace function public.memory_photos_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.memory_photos p where p.memory_id = new.memory_id) >= 12 then
    raise exception 'memory_photos_limit: не больше 12 фото в воспоминании'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.memory_photos_limit() from public, anon, authenticated;

create trigger memory_photos_limit
  before insert on public.memory_photos
  for each row execute function public.memory_photos_limit();

create or replace function public.memories_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger memories_touch
  before update on public.memories
  for each row execute function public.memories_touch();

-- ---------------------------------------------------------------------------
-- Хранилище.
--
-- Отдельный бакет, как у продуктов и вишлиста: свой потолок размера и свои
-- политики. Потолок на самом бакете, а не только в клиенте - клиент можно
-- обойти, а «в бакете нет тяжёлых файлов» должно держаться всегда.
-- 600 КБ: полный снимок 1600 px в WebP весит 150-350 КБ, превью 30-60 КБ.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-photos', 'memory-photos', false, 614400, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

create policy memory_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'memory-photos' and public.is_member());

-- Класть - только в папку своего воспоминания: первая часть пути - id записи
create policy memory_photos_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memory-photos' and public.is_member() and exists (
      select 1 from public.memories m
       where m.id::text = (storage.foldername(name))[1]
         and m.author_id = (select auth.uid())
    )
  );

-- Удалять - своё загруженное. По владельцу объекта, а не по записи:
-- при удалении воспоминания строки уже может не быть, а файлы надо убрать
create policy memory_photos_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'memory-photos' and public.is_member()
    and owner_id = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Уведомление второму

insert into public.texts (key, lang, value) values
  ('n.memory.added.male', 'ru', '%1$s добавил воспоминание'),
  ('n.memory.added.female', 'ru', '%1$s добавила воспоминание'),
  ('n.memory.added.other', 'ru', '%1$s добавил(а) воспоминание'),
  ('n.memory.added.male', 'kk', '%1$s естелік қосты'),
  ('n.memory.added.female', 'kk', '%1$s естелік қосты'),
  ('n.memory.added.other', 'kk', '%1$s естелік қосты'),
  ('n.memory.added.male', 'en', '%1$s added a memory'),
  ('n.memory.added.female', 'en', '%1$s added a memory'),
  ('n.memory.added.other', 'en', '%1$s added a memory'),
  ('n.memory.look', 'ru', 'Загляните в ленту воспоминаний.'),
  ('n.memory.look', 'kk', 'Естеліктер таспасына кіріп көріңдер.'),
  ('n.memory.look', 'en', 'Take a look at your memories.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_memory()
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
  target := public.partner_of(new.author_id);
  if target is null then
    return new;
  end if;
  title := public.tx_by(target, new.author_id, 'n.memory.added', public.nick_for(target, new.author_id));
  body := coalesce(nullif(btrim(new.caption), ''), new.place, public.tx(target, 'n.memory.look'));
  perform public.tg_notify_partner(
    new.author_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'memories');
  perform public.push_notify(target, title, body, 'memories', '/memories');
  return new;
end;
$$;

revoke execute on function public.tg_on_memory() from public, anon, authenticated;

create trigger memories_notify
  after insert on public.memories
  for each row execute function public.tg_on_memory();
