-- Совместные списки: что посмотреть, куда сходить, что подарить.
--
-- Отдельно от задач, потому что у пункта списка нет двух вещей, вокруг
-- которых построена задача: срока и ответственного. «Посмотреть Дюну»
-- не просрочивается и не висит ни на ком конкретно - она просто лежит,
-- пока не дойдут руки. Положи её в задачи, и она либо будет вечно висеть
-- просроченной, либо потребует выдумать дедлайн, которого нет.
--
-- Уведомлений здесь намеренно нет. Списки пополняются пачками - сел
-- вечером и накидал десять фильмов, - и уведомление на каждый пункт
-- было бы не вниманием, а спамом. Тема и задача уведомляют потому,
-- что предполагают ответ; список ответа не ждёт.

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  note text,

  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,

  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint list_items_done_consistent check (
    (done_at is null and done_by is null) or (done_at is not null and done_by is not null)
  )
);

create index list_items_list on public.list_items (list_id, done_at, created_at desc);

create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();
create trigger list_items_touch before update on public.list_items
  for each row execute function public.touch_updated_at();

alter table public.lists enable row level security;
alter table public.list_items enable row level security;
revoke all on public.lists from anon;
revoke all on public.list_items from anon;

create policy lists_select on public.lists
  for select to authenticated using (public.is_member());
create policy lists_insert on public.lists
  for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy lists_update on public.lists
  for update to authenticated using (public.is_member()) with check (public.is_member());
-- Список удаляет только заводивший: вместе с ним уходят все пункты,
-- в том числе чужие
create policy lists_delete on public.lists
  for delete to authenticated using (created_by = (select auth.uid()));

-- А вот пункты - общие целиком, включая удаление. Список на двоих затем
-- и нужен, чтобы второй мог вычеркнуть то, что уже неактуально
create policy list_items_select on public.list_items
  for select to authenticated using (public.is_member());
create policy list_items_insert on public.list_items
  for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy list_items_update on public.list_items
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy list_items_delete on public.list_items
  for delete to authenticated using (public.is_member());
