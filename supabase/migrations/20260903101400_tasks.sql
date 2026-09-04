-- Задачи с дедлайнами.
--
-- Общие на двоих: их видят и правят оба, а при наступлении дедлайна
-- уведомление уходит обоим сразу. Это отличает задачи от напоминаний о еде
-- (они личные) и от тем (там уведомление идёт партнёру автора).

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  notes text,

  -- Дедлайн необязателен: заметку «купить лампочку» полезно записать и без
  -- срока, а требовать его - значит заставлять выдумывать
  due_at timestamptz,

  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,

  -- Отметка, что о дедлайне уже сообщили. Задача проверки идёт часто,
  -- и без неё одно и то же уведомление приходило бы каждые пять минут,
  -- пока задачу не закроют.
  notified_at timestamptz,

  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_done_consistent check (
    (done_at is null and done_by is null) or (done_at is not null and done_by is not null)
  )
);

-- Горячий запрос задачи-планировщика: что просрочено и ещё не отправлено
create index tasks_due_idx on public.tasks (due_at)
  where done_at is null and notified_at is null;

create index tasks_open_idx on public.tasks (done_at, due_at);

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;
revoke all on public.tasks from anon;

create policy tasks_select on public.tasks
  for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy tasks_update on public.tasks
  for update to authenticated using (public.is_member()) with check (public.is_member());
-- Удаляет только автор, как и в темах: закрыть чужую задачу можно, стереть нет
create policy tasks_delete on public.tasks
  for delete to authenticated using (created_by = (select auth.uid()));

/**
 * Рассылка о наступивших дедлайнах.
 *
 * Уведомление идёт ОБОИМ участникам, а не только автору: задача общая,
 * и второй должен знать, что срок настал, даже если заводил её не он.
 *
 * notified_at ставится до отправки. Если отправка упадёт, повтора не будет -
 * и это сознательный выбор: неотправленное уведомление лучше, чем уведомление,
 * приходящее каждые пять минут из-за застрявшей ошибки.
 */
create or replace function public.notify_due_tasks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  task record;
  member record;
  message text;
  sent int := 0;
begin
  for task in
    select id, title, due_at
      from public.tasks
     where done_at is null
       and notified_at is null
       and due_at is not null
       and due_at <= now()
     order by due_at
     limit 50
  loop
    update public.tasks set notified_at = now() where id = task.id;

    message := 'Срок задачи наступил' || E'\n\n' || '<b>' || public.tg_escape(task.title) || '</b>';

    for member in
      select user_id from public.app_members
    loop
      perform public.tg_notify_self(member.user_id, message);
      perform public.push_notify(member.user_id, 'Срок задачи', task.title);
    end loop;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.notify_due_tasks() from public, anon, authenticated;

-- Каждые пять минут: дедлайн в 14:30 не должен ждать до 15:00.
-- Напоминания о еде привязаны к целым часам, поэтому у них своё расписание.
select cron.schedule('due-tasks', '*/5 * * * *', $$ select public.notify_due_tasks() $$);
