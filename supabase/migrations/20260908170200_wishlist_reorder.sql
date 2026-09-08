-- Порядок карточек одним вызовом.
--
-- Обычный upsert тут не годится: у wishlists title обязателен и без умолчания,
-- поэтому «обнови только sort_order» через upsert потребовал бы тащить с клиента
-- все поля каждой карточки - и любая гонка перезаписала бы чужое переименование
-- старым значением из вкладки, открытой полчаса назад.
--
-- Отдельная функция ещё и делает перестановку атомарной: порядок либо
-- применился целиком, либо не менялся. Иначе оборванная на середине серия
-- запросов оставила бы доску наполовину переставленной.

create or replace function public.reorder_wishlists(ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Нет доступа';
  end if;

  update public.wishlists w
     set sort_order = pos.n
    from unnest(ids) with ordinality as pos(id, n)
   where w.id = pos.id;
end;
$$;

revoke execute on function public.reorder_wishlists(uuid[]) from public, anon;
grant execute on function public.reorder_wishlists(uuid[]) to authenticated;
