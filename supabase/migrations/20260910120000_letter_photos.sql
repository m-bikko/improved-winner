-- Фотография в письме будущему.
--
-- Без кадрирования: у письма картинка не превью в сетке, а часть послания -
-- снимок дня, который вы захотели показать через год. Резать его в квадрат
-- значило бы обрезать то, ради чего он и приложен. Ужимается так же,
-- как фотографии продуктов: длинная сторона до 512, WebP, EXIF выброшен.
--
-- ГЛАВНОЕ: снимок запечатан вместе с письмом. Общая политика бакета «видят
-- участники» тут не годится - партнёр смог бы перечислить объекты и увидеть
-- картинку до срока, то есть обойти запечатывание с чёрного хода. Поэтому
-- доступ на чтение проверяет не членство, а доставку конкретного письма.

alter table public.letters add column image_path text;

comment on column public.letters.image_path is
  'Путь объекта в бакете letter-photos. Читается только после доставки.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letter-photos', 'letter-photos', false, 262144,
        array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- ---------------------------------------------------------------------------
-- Доставлено ли мне это письмо.
--
-- security definer, потому что политика хранилища спрашивает про строку,
-- которую RLS от спрашивающего прячет: запечатанное письмо не видит никто,
-- и обычный подзапрос вернул бы пусто и для автора, и для адресата.

create or replace function public.letter_delivered_to_me(letter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.letter_deliveries d
     where d.letter_id = letter and d.user_id = (select auth.uid())
  )
$$;

revoke execute on function public.letter_delivered_to_me(uuid) from public, anon;
grant execute on function public.letter_delivered_to_me(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Политики бакета.
--
-- Имя объекта - «<id письма>/<случайное>.webp», отсюда split_part.

create policy letter_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'letter-photos'
    and public.is_member()
    and public.letter_delivered_to_me(nullif(split_part(name, '/', 1), '')::uuid)
  );

-- На запись проверяем только членство: письма в этот момент ещё нет.
-- Id генерирует клиент - тот же приём, что у записей дневника, - и снимок
-- уезжает в хранилище до вставки строки. Осиротевший файл при неудачной
-- вставке возможен, но он никому не виден: без письма политика чтения
-- не пропустит к нему никого.
create policy letter_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'letter-photos' and public.is_member());

create policy letter_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'letter-photos' and public.is_member());
