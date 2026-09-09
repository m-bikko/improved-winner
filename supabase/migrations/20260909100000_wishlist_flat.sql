-- Вишлист становится плоским: одна запись - одно желание.
--
-- Карточка с чеклистом внутри оказалась непонятной, и по делу: она требовала
-- решить, что тут «желание», а что «шаг к нему», - а для «хочу съездить
-- в Грузию» такого деления просто нет. Двухуровневая модель имеет смысл там,
-- где нижний уровень действительно существует сам по себе; здесь он
-- выдумывался ради структуры.
--
-- Вместе с чеклистом уходит и состояние «приобретено»: оно держалось
-- на галочках. Купленное желание теперь удаляют - для списка хотелок
-- это честнее, чем архив.
--
-- Вместо вкладок появляется КАТЕГОРИЯ. Вкладки делили список по признаку,
-- который меняется сам («всё ли куплено»); категория - по смыслу желания,
-- и по ней действительно хочется отфильтровать: «покажи, куда мы хотели
-- съездить».

drop table public.wishlist_items cascade;

drop function if exists public.wishlist_closed_value(uuid);
drop function if exists public.tg_on_wishlist_item();

alter table public.wishlists drop column closed_at;

alter table public.wishlists add column details text;

alter table public.wishlists add column category text not null default 'buy'
  check (category in (
    'visit',   -- Хочу посетить
    'buy',     -- Хочу купить
    'try',     -- Хочу попробовать
    'food',    -- Еда
    'watch',   -- Посмотреть
    'read',    -- Прочитать
    'together',-- Сделать вместе
    'gift'     -- Подарить
  ));

create index wishlists_category on public.wishlists (category, sort_order);

comment on column public.wishlists.details is 'Подробности: ссылка, размер, цена, почему хочется.';
comment on column public.wishlists.category is 'Вид желания. Список закрыт и продублирован в интерфейсе.';

-- ---------------------------------------------------------------------------
-- Уведомления: событий стало меньше, потому что уровня пунктов больше нет

create or replace function public.tg_on_wishlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data record;
  actor uuid;
  who text;
  did text;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  actor := coalesce((select auth.uid()), row_data.created_by);
  select nickname into who from public.profiles where user_id = actor;
  who := coalesce(who, 'Партнёр');

  if tg_op = 'INSERT' then
    did := public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' в вишлист' || E'\n\n'
        || '<b>' || public.tg_escape(new.title) || '</b>'
        || case when new.details is null or btrim(new.details) = '' then ''
                else E'\n' || public.tg_escape(new.details) end,
      'wishlist');

  elsif tg_op = 'DELETE' then
    did := public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' из вишлиста «' || public.tg_escape(old.title) || '»',
      'wishlist');

  elsif new.title is distinct from old.title then
    did := public.by_sex(actor, 'переименовал', 'переименовала', 'переименовал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' желание' || E'\n\n'
        || public.tg_escape(old.title) || ' → <b>' || public.tg_escape(new.title) || '</b>',
      'wishlist');

  elsif new.image_path is distinct from old.image_path then
    did := case
      when new.image_path is null then public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)')
      when old.image_path is null then public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)')
      else public.by_sex(actor, 'поменял', 'поменяла', 'поменял(а)')
    end;
    perform public.tg_notify_both(
      who || ' ' || did || ' картинку к «' || public.tg_escape(new.title) || '»',
      'wishlist');

  elsif new.details is distinct from old.details or new.category is distinct from old.category then
    did := public.by_sex(actor, 'поправил', 'поправила', 'поправил(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' «' || public.tg_escape(new.title) || '» в вишлисте',
      'wishlist');
  end if;

  -- Перестановка порядка меняет только sort_order и сюда не доходит:
  -- сообщать «подвинул карточку» было бы шумом
  return null;
end;
$$;

revoke execute on function public.tg_on_wishlist() from public, anon, authenticated;
