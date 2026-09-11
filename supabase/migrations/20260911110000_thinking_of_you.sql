-- «Думаю о тебе» - одна кнопка.
--
-- Самое короткое сообщение, какое можно послать: без текста и без повода.
-- Именно поэтому его и пошлют - написать «скучаю» мешает не отсутствие
-- чувства, а необходимость подобрать слова.
--
-- ОСТЫВАНИЕ ОБЯЗАТЕЛЬНО. Кнопка, которую можно нажать двадцать раз подряд,
-- перестаёт что-либо значить с третьего нажатия, а партнёр перестаёт читать
-- уведомления вообще. Полчаса - достаточно, чтобы порыв остался порывом,
-- и мало, чтобы помешать послать дважды за вечер.
--
-- Держит это база, а не экран: заблокированную кнопку обходят перезагрузкой
-- страницы.

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index nudges_recent on public.nudges (from_id, created_at desc);

alter table public.nudges enable row level security;
revoke all on public.nudges from anon;

-- Видят оба: партнёру полезно знать, что о нём подумали, даже если
-- уведомление он пропустил
create policy nudges_select on public.nudges
  for select to authenticated using (public.is_member());

-- Пишет только функция: она обязана проверить остывание
revoke insert, update, delete on public.nudges from authenticated;

create or replace function public.send_nudge()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  last_at timestamptz;
  who text;
  target uuid;
begin
  if me is null or not public.is_member() then
    raise exception 'Нет доступа';
  end if;

  select n.created_at into last_at
    from public.nudges n where n.from_id = me
   order by n.created_at desc limit 1;

  if last_at is not null and last_at > now() - interval '30 minutes' then
    raise exception 'Уже отправлено недавно';
  end if;

  insert into public.nudges (from_id) values (me);

  target := public.partner_of(me);
  if target is null then
    return now();
  end if;

  select nickname into who from public.profiles where user_id = me;

  -- Текста нет намеренно: сообщение целиком в самом факте
  perform public.tg_notify_self(
    target,
    '<b>' || public.tg_escape(coalesce(who, 'Партнёр')) || ' думает о тебе</b>',
    'nudge');
  perform public.push_notify(
    target,
    coalesce(who, 'Партнёр') || ' думает о тебе',
    'Просто так',
    'nudge',
    '/today');

  return now();
end;
$$;

revoke execute on function public.send_nudge() from public, anon;
grant execute on function public.send_nudge() to authenticated;

-- Когда я в последний раз нажимал: экран должен показать остывание,
-- а не узнавать о нём из ошибки
create or replace function public.last_nudge()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(n.created_at) from public.nudges n
   where n.from_id = (select auth.uid()) and public.is_member()
$$;

revoke execute on function public.last_nudge() from public, anon;
grant execute on function public.last_nudge() to authenticated;

-- Новый вид уведомления
alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'letters', 'wishlist', 'nudge'
  ));
