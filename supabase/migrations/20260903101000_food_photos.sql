-- Фотографии продуктов.
--
-- Хранилище — Supabase Storage, а не колонка в базе. Base64 в таблице раздул бы
-- её на треть сверх самого файла, убил бы кэширование и тянулся бы в каждый
-- запрос списка продуктов, где картинка не нужна.
--
-- Бакет приватный: у приложения всё закрыто политиками, и делать фотографии
-- единственным публичным куском было бы странно. Клиент получает подписанные
-- ссылки пачкой на весь список.
--
-- Ограничение размера стоит на самом хранилище, а не только в клиенте: клиент
-- можно обойти, а инвариант «в бакете нет тяжёлых файлов» должен держаться
-- независимо от того, кто и чем загружает.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-photos',
  'food-photos',
  false,
  262144, -- 256 КБ. Клиент целится в ~100 КБ, это потолок на всякий случай
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

create policy food_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'food-photos' and public.is_member());

create policy food_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'food-photos' and public.is_member());

create policy food_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'food-photos' and public.is_member())
  with check (bucket_id = 'food-photos' and public.is_member());

create policy food_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'food-photos' and public.is_member());

-- Путь объекта, а не готовый URL: URL зависит от проекта и от того, публичный
-- бакет или нет, и протух бы при любом переезде.
alter table public.foods add column image_path text;

comment on column public.foods.image_path is
  'Путь объекта в бакете food-photos. Пусто — фотографии нет.';
