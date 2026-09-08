-- Картинки в вишлисте.
--
-- Устройство то же, что у фотографий продуктов, и это осознанное повторение,
-- а не копипаста от лени: отдельный бакет даёт отдельные политики и отдельный
-- потолок размера. Свалив всё в один, мы бы получили «удали товар - и вместе
-- с ним может уехать чужая картинка» ровно в тот день, когда кто-нибудь
-- напишет уборщик по префиксу.
--
-- Разница с продуктами одна: тут картинка всегда квадратная. Вишлист - это
-- сетка превью, а в сетке разноформатные картинки либо режутся на лету
-- (и тогда кроп решает браузер, а не человек), либо ломают ряд. Поэтому
-- квадрат вырезается на клиенте до загрузки, и в бакете лежит уже готовое.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wishlist-photos',
  'wishlist-photos',
  false,
  262144, -- 256 КБ. Квадрат 512x512 в WebP весит 40-90 КБ, это потолок с запасом
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

create policy wishlist_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'wishlist-photos' and public.is_member());

create policy wishlist_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wishlist-photos' and public.is_member());

create policy wishlist_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'wishlist-photos' and public.is_member())
  with check (bucket_id = 'wishlist-photos' and public.is_member());

create policy wishlist_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'wishlist-photos' and public.is_member());

alter table public.wishlist_items add column image_path text;

comment on column public.wishlist_items.image_path is
  'Путь объекта в бакете wishlist-photos. Пусто - картинки нет.';
