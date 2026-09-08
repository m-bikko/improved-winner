-- Правка формулировок в уведомлениях вишлиста.
--
-- Две ошибки, обе видны только в готовом сообщении.
--
-- «Бикош приобрёл Вилки» — «Посуда на кухню»» - лишняя кавычка. Ветка
-- склеивала строку так, будто перед названием пункта уже стоит открывающая
-- кавычка, а её там не было. Теперь пункт закавычен всегда, а различаются
-- только предлог и тире.
--
-- «Бикош поменял картинку» в момент, когда картинку добавили впервые.
-- Веток должно быть три: добавил, поменял, убрал.

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
    did := public.by_sex(actor, 'завёл', 'завела', 'открыл(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' вишлист' || E'\n\n'
        || '<b>' || public.tg_escape(new.title) || '</b>');

  elsif tg_op = 'DELETE' then
    did := public.by_sex(actor, 'удалил', 'удалила', 'удалил(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' вишлист «' || public.tg_escape(old.title) || '»');

  elsif new.title is distinct from old.title then
    did := public.by_sex(actor, 'переименовал', 'переименовала', 'переименовал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' вишлист' || E'\n\n'
        || public.tg_escape(old.title) || ' → <b>' || public.tg_escape(new.title) || '</b>');

  elsif new.image_path is distinct from old.image_path then
    did := case
      when new.image_path is null then public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)')
      when old.image_path is null then public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)')
      else public.by_sex(actor, 'поменял', 'поменяла', 'поменял(а)')
    end;
    perform public.tg_notify_both(
      who || ' ' || did || ' картинку вишлиста «' || public.tg_escape(new.title) || '»');
  end if;

  return null;
end;
$$;

create or replace function public.tg_on_wishlist_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data record;
  actor uuid;
  who text;
  wants text;
  did text;
  list record;
  was timestamptz;
  now_closed timestamptz;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;
  actor := coalesce((select auth.uid()), row_data.created_by);
  select nickname into who from public.profiles where user_id = actor;
  who := coalesce(who, 'Партнёр');

  select id, title, closed_at into list
    from public.wishlists where id = row_data.wishlist_id;
  if not found then
    return null;
  end if;

  if tg_op = 'INSERT' then
    did := public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)');
    if new.wanted_by is distinct from actor then
      select nickname into wants from public.profiles where user_id = new.wanted_by;
    end if;
    perform public.tg_notify_both(
      who || ' ' || did || ' в «' || public.tg_escape(list.title) || '»' || E'\n\n'
        || '<b>' || public.tg_escape(new.title) || '</b>'
        || case when wants is null then '' else ' — хочет ' || public.tg_escape(wants) end);

  elsif tg_op = 'DELETE' then
    did := public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' из «' || public.tg_escape(list.title) || '»: '
        || public.tg_escape(old.title));

  elsif (new.done_at is null) is distinct from (old.done_at is null) then
    did := case when new.done_at is not null
                then public.by_sex(actor, 'приобрёл', 'приобрела', 'отметил(а)')
                else public.by_sex(actor, 'вернул', 'вернула', 'вернул(а)') end;
    perform public.tg_notify_both(
      who || ' ' || did || ' «' || public.tg_escape(new.title) || '»'
        || case when new.done_at is null then ' в «' else ' — «' end
        || public.tg_escape(list.title) || '»');

  elsif new.title is distinct from old.title then
    did := public.by_sex(actor, 'переименовал', 'переименовала', 'переименовал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' пункт в «' || public.tg_escape(list.title) || '»' || E'\n\n'
        || public.tg_escape(old.title) || ' → <b>' || public.tg_escape(new.title) || '</b>');
  end if;

  was := list.closed_at;
  now_closed := public.wishlist_closed_value(list.id);

  if (was is null) is distinct from (now_closed is null) then
    update public.wishlists set closed_at = now_closed where id = list.id;
    perform public.tg_notify_both(
      case when now_closed is null
           then 'Вишлист <b>«' || public.tg_escape(list.title) || '»</b> вернулся в «Хотим»'
           else 'Вишлист <b>«' || public.tg_escape(list.title) || '»</b> собран целиком' || E'\n\n'
                || 'Карточка уехала в «Приобретено».' end);
  elsif was is distinct from now_closed then
    update public.wishlists set closed_at = now_closed where id = list.id;
  end if;

  return null;
end;
$$;

revoke execute on function public.tg_on_wishlist() from public, anon, authenticated;
revoke execute on function public.tg_on_wishlist_item() from public, anon, authenticated;
