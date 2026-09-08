-- Вишлист как карточка: картинка, ручной порядок, «хотим» и «приобретено».
--
-- Картинка переезжает с пункта на сам вишлист. Пункт - это строка чеклиста
-- («тарелки», «вилки»), у неё нет собственного облика; облик есть у желания
-- целиком («посуда на кухню»). Раздел из-за этого становится доской карточек,
-- а не списком списков.
--
-- «Приобретено» - НЕ отдельный статус, который кто-то выставляет руками:
-- карточка закрыта ровно тогда, когда закрыты все её пункты. Ручной статус
-- рядом с галочками неизбежно с ними разъезжается, и человеку приходится
-- помнить, что нажать вторым.
--
-- Но closed_at при этом ХРАНИТСЯ, а не считается на лету. Причина одна:
-- переход туда и обратно - событие, о котором уходит уведомление, а событие
-- нельзя заметить, сравнивая вычисляемое значение с самим собой. Расхождение
-- хранимого с фактическим ловит отдельная проверка.

alter table public.wishlists add column image_path text;
alter table public.wishlists add column closed_at timestamptz;
alter table public.wishlists add column sort_order int not null default 0;

comment on column public.wishlists.image_path is
  'Путь объекта в бакете wishlist-photos. Пусто - картинки нет.';
comment on column public.wishlists.closed_at is
  'Когда закрылся последний пункт. Пусто - карточка в «Хотим». Ведёт триггер.';

alter table public.wishlist_items drop column image_path;

-- Кто хочет. Для подарка это главное поле карточки: оно и отвечает
-- на вопрос, ради которого вишлист заводят.
alter table public.wishlist_items
  add column wanted_by uuid not null default auth.uid()
  references auth.users (id) on delete cascade;

create index wishlists_order on public.wishlists (sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Новая карточка встаёт сверху.
--
-- Доска расставлена руками, и место в её конце - худшее из возможных:
-- только что заведённое желание пришлось бы искать прокруткой.

create or replace function public.wishlist_place_on_top()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sort_order = 0 then
    select coalesce(min(w.sort_order), 0) - 1 into new.sort_order from public.wishlists w;
  end if;
  return new;
end;
$$;

create trigger wishlists_place_on_top before insert on public.wishlists
  for each row execute function public.wishlist_place_on_top();

-- ---------------------------------------------------------------------------
-- Закрытие карточки.
--
-- Пустая карточка закрытой не считается: «все ноль пунктов выполнены» -
-- формально правда, но человек ничего не приобретал, и в «Приобретено»
-- такая карточка выглядела бы враньём.

create or replace function public.wishlist_closed_value(list uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when count(*) = 0 then null
           when count(*) filter (where i.done_at is null) > 0 then null
           else max(i.done_at)
         end
    from public.wishlist_items i
   where i.wishlist_id = list
$$;

revoke execute on function public.wishlist_closed_value(uuid) from public, anon, authenticated;
