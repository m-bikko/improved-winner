-- Перестановка записей дневника одним вызовом.
--
-- После перетаскивания меняется и приём пищи, и порядок сразу у нескольких
-- строк. Отправлять их по одной значило бы серию запросов, между которыми
-- порядок на экране и в базе расходится - и если половина дойдёт, а половина
-- нет, дневник останется в состоянии, которого пользователь не задавал.
--
-- security invoker (значение по умолчанию), поэтому RLS работает как обычно:
-- переставить чужие записи функция не даст.

create or replace function public.reorder_diary(p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    update public.diary_entries
       set meal = item ->> 'meal',
           sort_order = (item ->> 'sort_order')::int,
           updated_at = now()
     where id = (item ->> 'id')::uuid;
  end loop;
end;
$$;

revoke execute on function public.reorder_diary(jsonb) from public, anon;
grant execute on function public.reorder_diary(jsonb) to authenticated;
