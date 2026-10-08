-- Третий аккаунт: функции базы проверяют, что спрашивает участник пары.
--
-- Все таблицы под RLS, и политики требуют членства (is_member). Но часть
-- функций SECURITY DEFINER, доступных роли authenticated, этого не проверяла:
-- пока аккаунтов было два, вызвать их было некому, кроме самих участников.
-- С доступом для повара появляется третий аккаунт, и через такие функции он
-- мог бы узнать, открыт ли цикл, идёт ли беременность, ответил ли кто-то
-- на вопрос дня, - или вызвать рассылку крона.
--
-- Два исправления:
-- 1. Функции, нужные только крону и другим функциям базы, больше не
--    вызываются ролью authenticated вовсе. Внутри других функций они
--    работают как прежде: там права владельца.
-- 2. Функции, которые зовёт клиент или политики, получили проверку
--    «спрашивает участник». Пустой auth.uid() - это крон или триггер без
--    запроса пользователя, им проверка не мешает.
--
-- Проверка check-outsider держит инвариант: любая функция SECURITY DEFINER,
-- доступная authenticated, проверяет участника или повара (явные исключения
-- там же, с причиной).

revoke execute on function public.checkin_streak(uuid, date) from public, authenticated;
revoke execute on function public.cycle_delay(uuid, date) from public, authenticated;
revoke execute on function public.cycle_state(uuid, date) from public, authenticated;
revoke execute on function public.in_quiet_hours(uuid) from public, authenticated;
revoke execute on function public.pregnancy_active(uuid) from public, authenticated;
revoke execute on function public.wishlist_place_on_top() from public, authenticated;
revoke execute on function public.send_meeting_reminders() from public, authenticated;
revoke execute on function public.send_pregnancy_weeks() from public, authenticated;
revoke execute on function public.send_prep_reminders() from public, authenticated;
revoke execute on function public.send_pulse_reminders() from public, authenticated;
revoke execute on function public.send_question_reminders() from public, authenticated;
revoke execute on function public.send_weigh_in_reminders() from public, authenticated;

-- Проверка участника внутри - тело каждой функции прежнее, обёрнутое

CREATE OR REPLACE FUNCTION public.attention_count(target uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when ((select auth.uid()) is null or public.is_member()) then (

  with tz as (
    select coalesce(p.timezone, 'Asia/Almaty') as name
      from public.profiles p where p.user_id = target
  ),
  local_now as (select now() at time zone (select name from tz) as ts)
  select
    -- Самочувствие. Считаем только после часа, когда о нём спрашивают:
    -- бейдж в 00:05 с требованием отметиться - это не напоминание,
    -- а придирка
    (select case
       when extract(hour from (select ts from local_now))::int < 11 then 0
       when exists (
         select 1 from public.checkins c
          where c.user_id = target and c.date = (select ts from local_now)::date
       ) then 0
       else 1
     end)
    +
    -- Просроченные задачи. Повторяющиеся не в счёт: у них due_at двигает
    -- планировщик, и «просрочено» для них - состояние на пять минут
    -- до ближайшего запуска рассылки
    (select count(*)::int from public.tasks t
      where t.done_at is null
        and t.recurrence is null
        and t.due_at is not null
        and t.due_at < now())
  ) else 0 end
$function$;

CREATE OR REPLACE FUNCTION public.cycle_shared_with_me(owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.cycle_settings s
     where s.user_id = owner
       and s.tracking_enabled
       and s.share_with_partner
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.idea_is_match(of_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select (select count(*) from public.idea_votes v where v.idea_key = of_key and v.liked) >= 2
  )
$function$;

CREATE OR REPLACE FUNCTION public.letter_delivered_to_me(letter uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.letter_deliveries d
     where d.letter_id = letter and d.user_id = (select auth.uid())
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.med_is_mine(of_med uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (select 1 from public.medications m where m.id = of_med and m.user_id = (select auth.uid()))
  )
$function$;

CREATE OR REPLACE FUNCTION public.pause_noted_by(of_pause uuid, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (select 1 from public.pause_notes n where n.pause_id = of_pause and n.user_id = who)
  )
$function$;

CREATE OR REPLACE FUNCTION public.pause_noted_by_partner(of_pause uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.pause_notes n where n.pause_id = of_pause and n.user_id <> (select auth.uid())
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.pause_writable(of_pause uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.pauses p where p.id = of_pause and p.ends_at <= now() and p.closed_at is null
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.pulse_done_by_me(of_month date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.pulse_entries e where e.user_id = (select auth.uid()) and e.month = of_month
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.pulse_done_by_partner(of_month date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.pulse_entries e where e.user_id <> (select auth.uid()) and e.month = of_month
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.question_answered_by_me(on_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.question_answers a
     where a.user_id = (select auth.uid()) and a.date = on_date
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.question_answered_by_partner(on_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.question_answers a
     where a.user_id <> (select auth.uid()) and a.date = on_date
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.shot_file_open(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.shots s
     where (s.path = object_name or s.thumb_path = object_name)
       and public.shot_open(s.day)
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.shot_open(of_day date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
      select 1 from public.shots s where s.user_id = (select auth.uid()) and s.day = of_day
    )
    or exists (
      select 1 from public.shot_prompts p
       where p.day = of_day and p.sent_at is not null and p.sent_at + interval '24 hours' < now()
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.tot_done_by_me(round uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select public.tot_done_by(round, (select auth.uid()))
  )
$function$;

CREATE OR REPLACE FUNCTION public.watch_rated_by_me(item uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.watch_ratings r
     where r.item_id = item and r.user_id = (select auth.uid())
  )
  )
$function$;

CREATE OR REPLACE FUNCTION public.wish_is_others(of_wish uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is null or public.is_member()) and (

  select exists (
    select 1 from public.wishlists w where w.id = of_wish and w.created_by <> (select auth.uid())
  )
  )
$function$;
