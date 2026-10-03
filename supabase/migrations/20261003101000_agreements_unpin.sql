-- Переоткрытая договорённость снимается с закрепления сама.
--
-- CHECK topics_pin_closed разрешает закреплять только решённое, и
-- переоткрытие закреплённой темы падало на нём: «Вернуть в обсуждение»
-- не сбрасывает pinned_at. Чинить это в клиенте мало - приложение
-- предыдущей версии на телефоне второго о закреплении не знает.
-- BEFORE-триггер выполняется до проверки ограничений, так что CHECK
-- остаётся инвариантом, а переоткрытие просто работает.

create or replace function public.topics_unpin_on_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'closed' then
    new.pinned_at := null;
  end if;
  return new;
end;
$$;

create trigger topics_unpin_on_reopen
  before update of status on public.topics
  for each row execute function public.topics_unpin_on_reopen();
