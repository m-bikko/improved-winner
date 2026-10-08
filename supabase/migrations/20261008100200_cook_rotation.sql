-- Новая ссылка повара закрывает старую сразу, а не через час.
--
-- Выпуск ссылки удалял refresh-токены и сессии, но уже выданный токен
-- доступа живёт до часа, и база считала его владельца действующим поваром:
-- проверка в браузере показала, что после «Новой ссылки» старый телефон
-- ещё видел дневник. Теперь действующий повар - тот, чей токен выдан не раньше
-- текущей ссылки: iat токена сравнивается с моментом выпуска. Сравнение по
-- целым секундам - iat у токена в секундах, и вход в ту же секунду, что
-- и выпуск, должен проходить.
--
-- Токена без iat в запросах из приложения не бывает; его нет только у прямых
-- запросов к базе (проверки), где роль задаётся вручную.

create or replace function public.cook_owner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.owner_id from public.cooks c
   where c.user_id = (select auth.uid())
     and c.link_issued_at is not null
     and c.revoked_at is null
     and (
       (select auth.jwt() ->> 'iat') is null
       or (select auth.jwt() ->> 'iat')::bigint >= floor(extract(epoch from c.link_issued_at))
     )
$$;
