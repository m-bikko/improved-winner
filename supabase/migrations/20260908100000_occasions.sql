-- Важные даты: дни рождения, годовщины и всё, что нельзя забыть.
--
-- Формально это заводится задачей с повторением «раз в год», и первым делом
-- я хотел так и сделать. Но задача - про «сделать», и живёт она в списке дел,
-- откуда исчезает после отметки. Дата - про «помнить»: её не закрывают,
-- она возвращается каждый год сама, и главный вопрос к ней не «сделано ли»,
-- а «сколько осталось».
--
-- Отсюда и разница в поведении: у даты нет done_at, зато есть напоминание
-- за неделю - чтобы успеть с подарком, а не узнать об этом утром.

create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),

  -- Исходная дата вместе с годом: по нему считается, которая это годовщина.
  -- Год обязателен - «14 сентября» без года не даст сказать «десять лет»
  date date not null check (date >= '1900-01-01'),

  kind text not null default 'other' check (kind in ('birthday', 'anniversary', 'other')),

  -- Почти всегда повторяется, но не всегда: «защита диплома 12 июня»
  -- стоит помнить один раз
  yearly boolean not null default true,
  note text,

  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index occasions_date on public.occasions (date);

create trigger occasions_touch before update on public.occasions
  for each row execute function public.touch_updated_at();

alter table public.occasions enable row level security;
revoke all on public.occasions from anon;

create policy occasions_select on public.occasions
  for select to authenticated using (public.is_member());
create policy occasions_insert on public.occasions
  for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy occasions_update on public.occasions
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy occasions_delete on public.occasions
  for delete to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Ближайшее наступление даты.
--
-- Вынесено в функцию, потому что считается в трёх местах: в рассылке,
-- в списке на экране и в проверке. Три копии календарной арифметики -
-- три способа разойтись на високосном году.
--
-- 29 февраля в невисокосный год Postgres сам сдвигает на 1 марта
-- (make_date падать не станет, а date + interval округлит), поэтому
-- считаем через интервал в годах от исходной даты.

create or replace function public.occasion_next(source date, yearly boolean, today date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when not yearly then source
    else source + (
      -- Сколько лет прибавить, чтобы попасть в сегодня или позже
      greatest(0, extract(year from age(today, source))::int
                  + case when (source + (extract(year from age(today, source))::int
                                         || ' years')::interval)::date < today
                         then 1 else 0 end)
      || ' years')::interval
  end::date
$$;

-- ---------------------------------------------------------------------------
-- Рассылка: за неделю и в день.
--
-- Отметка об отправке хранится с указанием человека и года: участники могут
-- жить в разных поясах, и «сегодня» у них наступает в разное время.

create table public.occasion_notices (
  occasion_id uuid not null references public.occasions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  year int not null,
  lead int not null check (lead in (0, 7)),
  created_at timestamptz not null default now(),
  primary key (occasion_id, user_id, year, lead)
);

alter table public.occasion_notices enable row level security;
revoke all on public.occasion_notices from anon, authenticated;

create or replace function public.notify_occasions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  item record;
  local_now timestamp;
  today date;
  next_on date;
  days int;
  years int;
  headline text;
  tail text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 10 then
      continue;
    end if;

    for item in select id, title, date, kind, yearly, note from public.occasions
    loop
      next_on := public.occasion_next(item.date, item.yearly, today);
      days := next_on - today;

      if days not in (0, 7) then
        continue;
      end if;

      if exists (
        select 1 from public.occasion_notices n
         where n.occasion_id = item.id and n.user_id = person.user_id
           and n.year = extract(year from next_on)::int and n.lead = days
      ) then
        continue;
      end if;

      years := extract(year from next_on)::int - extract(year from item.date)::int;
      tail := case
        when not item.yearly or years <= 0 then ''
        when item.kind = 'birthday' then E'\n' || 'Исполняется ' || years || ' '
          || case when years % 10 = 1 and years % 100 <> 11 then 'год'
                  when years % 10 between 2 and 4 and years % 100 not between 12 and 14 then 'года'
                  else 'лет' end
        else E'\n' || years || '-я годовщина'
      end;

      headline := case when days = 0 then 'Сегодня' else 'Через неделю' end;

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || headline || ': ' || public.tg_escape(item.title) || '</b>'
          || public.tg_escape(tail)
          || case when days = 7 then E'\n\n' || 'Есть неделя, чтобы успеть с подарком.'
                  else '' end
          || case when item.note is null or btrim(item.note) = '' then ''
                  else E'\n\n' || public.tg_escape(item.note) end
      );
      perform public.push_notify(
        person.user_id,
        headline,
        item.title || replace(tail, E'\n', ' · '),
        '/dates'
      );

      insert into public.occasion_notices (occasion_id, user_id, year, lead)
      values (item.id, person.user_id, extract(year from next_on)::int, days)
      on conflict do nothing;

      sent := sent + 1;
    end loop;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.notify_occasions() from public, anon, authenticated;

select cron.schedule('occasions', '0 * * * *', $$ select public.notify_occasions() $$);
