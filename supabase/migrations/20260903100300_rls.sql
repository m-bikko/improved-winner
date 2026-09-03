-- Row Level Security.
--
-- Модель доступа:
--   общее   — foods, food_servings, dish_items, topics, topic_comments
--   личное  — diary_entries, weight_log, profiles: пишет только владелец,
--             но ЧИТАЮТ оба (согласовано: дневники нужны для сравнения
--             «что делает партнёр и я»)
--
-- Каждая политика вешается на роль authenticated и проверяет членство в app_members.
-- Одной проверки auth.role() = 'authenticated' мало: если в проекте когда-нибудь
-- появится третий аккаунт, он получил бы полный доступ ко всему.

alter table public.app_members enable row level security;
alter table public.foods enable row level security;
alter table public.food_servings enable row level security;
alter table public.dish_items enable row level security;
alter table public.diary_entries enable row level security;
alter table public.weight_log enable row level security;
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.topic_comments enable row level security;

-- Анонимной роли в этом приложении делать нечего: любой экран требует входа.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on routines from anon;

-- ---------------------------------------------------------------------------
-- app_members — только чтение, и только своим. Правится через service_role
-- из scripts/bootstrap-users.ts.
-- ---------------------------------------------------------------------------

create policy app_members_select on public.app_members
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Общие справочники
-- ---------------------------------------------------------------------------

create policy foods_select on public.foods
  for select to authenticated using (public.is_member());
create policy foods_insert on public.foods
  for insert to authenticated with check (public.is_member());
create policy foods_update on public.foods
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy foods_delete on public.foods
  for delete to authenticated using (public.is_member());

create policy food_servings_select on public.food_servings
  for select to authenticated using (public.is_member());
create policy food_servings_insert on public.food_servings
  for insert to authenticated with check (public.is_member());
create policy food_servings_update on public.food_servings
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy food_servings_delete on public.food_servings
  for delete to authenticated using (public.is_member());

create policy dish_items_select on public.dish_items
  for select to authenticated using (public.is_member());
create policy dish_items_insert on public.dish_items
  for insert to authenticated with check (public.is_member());
create policy dish_items_update on public.dish_items
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy dish_items_delete on public.dish_items
  for delete to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Дневник: видят оба, пишет каждый только свой
-- ---------------------------------------------------------------------------

create policy diary_select on public.diary_entries
  for select to authenticated using (public.is_member());
create policy diary_insert on public.diary_entries
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy diary_update on public.diary_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy diary_delete on public.diary_entries
  for delete to authenticated using (user_id = (select auth.uid()));

create policy weight_select on public.weight_log
  for select to authenticated using (public.is_member());
create policy weight_insert on public.weight_log
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy weight_update on public.weight_log
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy weight_delete on public.weight_log
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Профиль: ник партнёра нужен для подписи автора темы, поэтому читают оба.
-- Вес и цели при этом тоже видны — решение принято осознанно.
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated using (public.is_member());
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Темы: правят оба (закрыть тему может любой), удаляет только автор
-- ---------------------------------------------------------------------------

create policy topics_select on public.topics
  for select to authenticated using (public.is_member());
create policy topics_insert on public.topics
  for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy topics_update on public.topics
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy topics_delete on public.topics
  for delete to authenticated using (created_by = (select auth.uid()));

create policy topic_comments_select on public.topic_comments
  for select to authenticated using (public.is_member());
create policy topic_comments_insert on public.topic_comments
  for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));
create policy topic_comments_update on public.topic_comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy topic_comments_delete on public.topic_comments
  for delete to authenticated using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Права на функции
-- ---------------------------------------------------------------------------

revoke execute on function public.search_topics(text) from public, anon;
grant execute on function public.search_topics(text) to authenticated;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
