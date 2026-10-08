-- Доступ для повара.
--
-- У Бикоша есть повар, который считает граммовку его еды. Ему нужен свой
-- вход - без PIN и без уведомлений - и только две вещи: дневник Бикоша
-- (смотреть) и справочник продуктов (смотреть всё, добавлять и править
-- своё). Ничего больше: ни тем, ни цикла, ни дневника Аминош, ни профилей.
--
-- Повар - отдельный аккаунт auth (cook@lovepromises.app), НЕ участник пары:
-- в app_members его нет, и все существующие политики, требующие is_member(),
-- его не пускают. Ему добавлены свои политики, узкие и только на нужное.
--
-- Вход - по ссылке с секретом во фрагменте адреса (#...): фрагмент не уходит
-- на сервер и не попадает в логи. Секрет - это пароль аккаунта повара;
-- в базе только его bcrypt-хеш. Ссылку выпускает и отзывает сам Бикош
-- в профиле: выпуск ставит новый пароль и рвёт сессии старой ссылки,
-- отзыв закрывает доступ сразу - is_cook() смотрит на revoked_at, так что
-- даже ещё живой токен доступа перестаёт что-либо открывать.

-- Кто добавил продукт: «своё» у повара определяет база, а не клиент
alter table public.foods alter column created_by set default auth.uid();

create table public.cooks (
  user_id uuid primary key references auth.users on delete cascade,
  -- Чей дневник видит повар
  owner_id uuid not null references auth.users on delete cascade,
  -- Когда выпущена действующая ссылка. Пусто - ссылки ещё не было
  link_issued_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.cooks is
  'Повар: отдельный аккаунт, видит дневник владельца и справочник продуктов.';

alter table public.cooks enable row level security;
revoke all on public.cooks from anon;

create policy cooks_select on public.cooks for select to authenticated
  using ((public.is_member() and owner_id = (select auth.uid())) or user_id = (select auth.uid()));

-- Действующий повар: ссылка выпущена и не отозвана
create or replace function public.cook_owner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.owner_id from public.cooks c
   where c.user_id = (select auth.uid()) and c.link_issued_at is not null and c.revoked_at is null
$$;

create or replace function public.is_cook()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.cook_owner() is not null
$$;

revoke execute on function public.cook_owner() from public, anon;
revoke execute on function public.is_cook() from public, anon;
grant execute on function public.cook_owner() to authenticated;
grant execute on function public.is_cook() to authenticated;

-- Свой ли продукт у повара - по id или по папке фото (первая часть пути)
create or replace function public.cook_owns_food(of_food uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_cook() and exists (
    select 1 from public.foods f where f.id = of_food and f.created_by = (select auth.uid())
  )
$$;

create or replace function public.cook_owns_food_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_cook() and exists (
    select 1 from public.foods f
     where f.id::text = (storage.foldername(object_name))[1] and f.created_by = (select auth.uid())
  )
$$;

revoke execute on function public.cook_owns_food(uuid) from public, anon;
revoke execute on function public.cook_owns_food_path(text) from public, anon;
grant execute on function public.cook_owns_food(uuid) to authenticated;
grant execute on function public.cook_owns_food_path(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Справочник: видит всё, добавляет своё, правит и удаляет только своё

create policy foods_select_cook on public.foods for select to authenticated using (public.is_cook());
create policy foods_insert_cook on public.foods for insert to authenticated
  with check (public.is_cook() and created_by = (select auth.uid()));
create policy foods_update_cook on public.foods for update to authenticated
  using (public.is_cook() and created_by = (select auth.uid()))
  with check (public.is_cook() and created_by = (select auth.uid()));
create policy foods_delete_cook on public.foods for delete to authenticated
  using (public.is_cook() and created_by = (select auth.uid()));

create policy food_servings_select_cook on public.food_servings for select to authenticated using (public.is_cook());
create policy food_servings_insert_cook on public.food_servings for insert to authenticated
  with check (public.cook_owns_food(food_id));
create policy food_servings_update_cook on public.food_servings for update to authenticated
  using (public.cook_owns_food(food_id)) with check (public.cook_owns_food(food_id));
create policy food_servings_delete_cook on public.food_servings for delete to authenticated
  using (public.cook_owns_food(food_id));

create policy dish_items_select_cook on public.dish_items for select to authenticated using (public.is_cook());
create policy dish_items_insert_cook on public.dish_items for insert to authenticated
  with check (public.cook_owns_food(dish_id));
create policy dish_items_update_cook on public.dish_items for update to authenticated
  using (public.cook_owns_food(dish_id)) with check (public.cook_owns_food(dish_id));
create policy dish_items_delete_cook on public.dish_items for delete to authenticated
  using (public.cook_owns_food(dish_id));

-- Дневник и норма дня - только владельца и только чтение
create policy diary_select_cook on public.diary_entries for select to authenticated
  using (public.is_cook() and user_id = public.cook_owner());
create policy daily_goals_select_cook on public.daily_goals for select to authenticated
  using (public.is_cook() and user_id = public.cook_owner());

-- Фото продуктов: видит все, кладёт - только в папку своего продукта,
-- удаляет - только своё загруженное
create policy food_photos_select_cook on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and public.is_cook());
create policy food_photos_insert_cook on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and public.cook_owns_food_path(name));
create policy food_photos_delete_cook on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and public.is_cook() and owner_id = (select auth.uid())::text);

-- Чей дневник - для заголовка экрана повара. Ник, и только он
create or replace function public.cook_context()
returns table (owner_id uuid, owner_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.owner_id, p.nickname
    from public.cooks c
    join public.profiles p on p.user_id = c.owner_id
   where c.user_id = (select auth.uid()) and public.is_cook()
$$;

revoke execute on function public.cook_context() from public, anon;
grant execute on function public.cook_context() to authenticated;

-- ---------------------------------------------------------------------------
-- Ссылка: выпустить, отозвать, посмотреть - только владельцу повара

create or replace function public.cook_status()
returns table (issued_at timestamptz, revoked_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.link_issued_at, c.revoked_at, u.last_sign_in_at
    from public.cooks c
    join auth.users u on u.id = c.user_id
   where public.is_member() and c.owner_id = (select auth.uid())
$$;

-- Новый секрет: старая ссылка и все её сессии перестают работать.
-- 24 случайных байта - 32 символа base64url, перебором не подобрать
create or replace function public.cook_link_issue()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cook uuid;
  secret text;
begin
  if not public.is_member() then
    raise exception 'cook_link_issue: только для участников' using errcode = '42501';
  end if;
  select c.user_id into cook from public.cooks c where c.owner_id = (select auth.uid());
  if not found then
    raise exception 'cook_link_issue: повар не заведён' using errcode = 'P0002';
  end if;
  secret := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  update auth.users
     set encrypted_password = extensions.crypt(secret, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = cook;
  delete from auth.refresh_tokens where user_id = cook::text;
  delete from auth.sessions where user_id = cook;
  update public.cooks set link_issued_at = now(), revoked_at = null where user_id = cook;
  return secret;
end;
$$;

-- Отзыв: пароль - случайный и никому не известный, сессии разорваны,
-- а revoked_at закрывает всё сразу, не дожидаясь конца токена доступа
create or replace function public.cook_link_revoke()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cook uuid;
begin
  if not public.is_member() then
    raise exception 'cook_link_revoke: только для участников' using errcode = '42501';
  end if;
  select c.user_id into cook from public.cooks c where c.owner_id = (select auth.uid());
  if not found then
    return;
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = cook;
  delete from auth.refresh_tokens where user_id = cook::text;
  delete from auth.sessions where user_id = cook;
  update public.cooks set revoked_at = now() where user_id = cook;
end;
$$;

revoke execute on function public.cook_status() from public, anon;
revoke execute on function public.cook_link_issue() from public, anon;
revoke execute on function public.cook_link_revoke() from public, anon;
grant execute on function public.cook_status() to authenticated;
grant execute on function public.cook_link_issue() to authenticated;
grant execute on function public.cook_link_revoke() to authenticated;
