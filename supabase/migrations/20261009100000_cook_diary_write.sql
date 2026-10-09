-- Повар записывает съеденное в дневник владельца.
--
-- Сначала дневник был повару только для просмотра. Но повар и кормит:
-- ему естественно сразу записать, что и сколько он подал, - а не ждать,
-- пока владелец сам внесёт тарелку, которую не взвешивал.
--
-- Что можно повару:
-- - добавлять записи в дневник ВЛАДЕЛЬЦА - и только его;
-- - править и удалять СВОИ записи. Записи владельца - только смотреть.
-- Владелец, как и раньше, правит и удаляет любые записи своего дневника,
-- в том числе внесённые поваром.
--
-- Кто внёс запись - новая колонка created_by. Ставит её база, а не клиент;
-- у старых записей пусто (их вносил сам владелец).

alter table public.diary_entries
  add column if not exists created_by uuid default auth.uid() references auth.users on delete set null;

comment on column public.diary_entries.created_by is
  'Кто внёс запись. Пусто у старых - их вносил владелец. Повар правит только свои.';

create policy diary_insert_cook on public.diary_entries for insert to authenticated
  with check (public.is_cook() and user_id = public.cook_owner() and created_by = (select auth.uid()));
create policy diary_update_cook on public.diary_entries for update to authenticated
  using (public.is_cook() and user_id = public.cook_owner() and created_by = (select auth.uid()))
  with check (public.is_cook() and user_id = public.cook_owner() and created_by = (select auth.uid()));
create policy diary_delete_cook on public.diary_entries for delete to authenticated
  using (public.is_cook() and user_id = public.cook_owner() and created_by = (select auth.uid()));
