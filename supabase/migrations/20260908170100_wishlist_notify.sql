-- Уведомления по вишлисту - на каждое действие и обоим.
--
-- Это разворот прежнего решения. Раньше раздел молчал намеренно: списки
-- пополняются пачками, и уведомление на каждый пункт выглядело спамом -
-- на молчание даже стояла проверка. Владелец решил иначе, и довод у него
-- сильный: пара живёт порознь, вишлист - это доска, за которой оба следят,
-- и «она добавила посуду» знать хочется сразу, а не при следующем заходе.
--
-- Обоим, включая того, кто нажал. Уведомление о собственном действии обычно
-- шум, но здесь оно работает подтверждением: карточка ушла в общую доску,
-- а не осталась на твоём телефоне.
--
-- Только телеграм. Push тут добавил бы второй звук на то же событие,
-- а событий в этом разделе много.

create or replace function public.tg_notify_both(message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
begin
  for person in select user_id from public.app_members
  loop
    perform public.tg_notify_self(person.user_id, message);
  end loop;
end;
$$;

revoke execute on function public.tg_notify_both(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------

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
    did := case when new.image_path is null
                then public.by_sex(actor, 'убрал', 'убрала', 'убрал(а)')
                else public.by_sex(actor, 'поменял', 'поменяла', 'поменял(а)') end;
    perform public.tg_notify_both(
      who || ' ' || did || ' картинку вишлиста «' || public.tg_escape(new.title) || '»');
  end if;

  -- Про closed_at здесь молчим: смену состояния карточки сообщает триггер
  -- пунктов, который её и вызвал. Иначе на одно нажатие галочки пришло бы
  -- два сообщения об одном и том же
  return null;
end;
$$;

create trigger wishlists_notify
  after insert or update or delete on public.wishlists
  for each row execute function public.tg_on_wishlist();

-- ---------------------------------------------------------------------------

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
    -- Вишлист удаляют целиком: о каждом уехавшем пункте сообщать незачем
    return null;
  end if;

  if tg_op = 'INSERT' then
    did := public.by_sex(actor, 'добавил', 'добавила', 'добавил(а)');
    -- Кого назвали хотящим, говорим только когда это не сам автор:
    -- «Бикош добавил (хочет Бикош)» - строка ни о чём
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
      who || ' ' || did || ' ' || public.tg_escape(new.title)
        || case when new.done_at is null then ' в «' else '» — «' end
        || public.tg_escape(list.title) || '»');

  elsif new.title is distinct from old.title then
    did := public.by_sex(actor, 'переименовал', 'переименовала', 'переименовал(а)');
    perform public.tg_notify_both(
      who || ' ' || did || ' пункт в «' || public.tg_escape(list.title) || '»' || E'\n\n'
        || public.tg_escape(old.title) || ' → <b>' || public.tg_escape(new.title) || '</b>');
  end if;

  -- Пересчёт состояния карточки и сообщение о переходе
  was := list.closed_at;
  now_closed := public.wishlist_closed_value(list.id);

  if (was is null) is distinct from (now_closed is null) then
    update public.wishlists set closed_at = now_closed where id = list.id;
    perform public.tg_notify_both(
      case when now_closed is null
           then '<b>«' || public.tg_escape(list.title) || '»</b> вернулся в «Хотим»'
           else '<b>«' || public.tg_escape(list.title) || '»</b> собран целиком' || E'\n\n'
                || 'Карточка уехала в «Приобретено».' end);
  elsif was is distinct from now_closed then
    -- Дата закрытия сдвинулась, но состояние то же: обновляем молча
    update public.wishlists set closed_at = now_closed where id = list.id;
  end if;

  return null;
end;
$$;

create trigger wishlist_items_notify
  after insert or update or delete on public.wishlist_items
  for each row execute function public.tg_on_wishlist_item();

revoke execute on function public.tg_on_wishlist() from public, anon, authenticated;
revoke execute on function public.tg_on_wishlist_item() from public, anon, authenticated;
