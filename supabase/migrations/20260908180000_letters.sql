-- Письмо в будущее: написал сегодня, придёт в выбранный день.
--
-- Главное свойство - НЕВИДИМОСТЬ ДО СРОКА. Письмо, которое адресат может
-- прочитать заранее, письмом в будущее не является, и держать это правило
-- в интерфейсе нельзя: экран можно обойти, политику - нет.
--
-- Отсюда же запрет на правку после отправки: отправленное письмо уже прочитано,
-- и менять его задним числом значило бы переписывать чужую память.

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Кому. «Обоим» - это «через год посмотрим, что мы думали»:
  -- такое письмо адресовано в том числе себе
  audience text not null default 'partner' check (audience in ('partner', 'both')),

  deliver_on date not null,
  body text not null check (length(btrim(body)) > 0),

  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index letters_due on public.letters (deliver_on) where delivered_at is null;

create trigger letters_touch before update on public.letters
  for each row execute function public.touch_updated_at();

alter table public.letters enable row level security;
revoke all on public.letters from anon;

-- Читает автор - всегда, адресат - только после доставки.
-- Это и есть весь смысл раздела, выраженный политикой
create policy letters_select on public.letters for select to authenticated
  using (
    public.is_member()
    and (author_id = (select auth.uid()) or delivered_at is not null)
  );

create policy letters_insert on public.letters for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));

-- Правит и удаляет только автор и только до отправки
create policy letters_update on public.letters for update to authenticated
  using (author_id = (select auth.uid()) and delivered_at is null)
  with check (author_id = (select auth.uid()) and delivered_at is null);

create policy letters_delete on public.letters for delete to authenticated
  using (author_id = (select auth.uid()) and delivered_at is null);

-- ---------------------------------------------------------------------------
-- Доставка в 9 утра по поясу получателя.
--
-- Час свободен: еда в 11, 14 и 21, даты в 10, опрос в 11 и 22, советы в 13,
-- напоминание о любви в 18. Письмо не должно приходить в общей очереди
-- с напоминанием про обед.
--
-- delivered_at ставится ДО отправки: упавшая отправка потеряет письмо,
-- зато не превратит его в ежечасную рассылку одного и того же. Тот же выбор,
-- что и у сроков задач.

create or replace function public.deliver_letters()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  letter record;
  person record;
  author text;
  written text;
  head text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    if extract(hour from now() at time zone person.tz)::int <> 9 then
      continue;
    end if;

    for letter in
      select l.id, l.author_id, l.audience, l.body, l.created_at
        from public.letters l
       where l.delivered_at is null
         and l.deliver_on <= (now() at time zone person.tz)::date
       order by l.deliver_on
       limit 20
    loop
      -- Себе письмо приходит только если оно адресовано обоим
      if letter.author_id = person.user_id and letter.audience <> 'both' then
        continue;
      end if;

      select nickname into author from public.profiles where user_id = letter.author_id;
      written := to_char(letter.created_at at time zone person.tz, 'DD.MM.YYYY');

      head := case
        when letter.audience = 'both' then 'Письмо из прошлого'
        else 'Письмо от ' || coalesce(author, 'партнёра')
      end;

      perform public.tg_notify_self(
        person.user_id,
        '<b>' || public.tg_escape(head) || '</b>' || E'\n'
          || '<i>написано ' || written || '</i>' || E'\n\n'
          || public.tg_escape(letter.body));
      perform public.push_notify(person.user_id, head, left(letter.body, 120), '/dates');

      sent := sent + 1;
    end loop;
  end loop;

  -- Помечаем доставленными только то, что уже разослано всем, кому следовало:
  -- отметка внутри цикла по людям закрыла бы письмо после первого же адресата
  update public.letters
     set delivered_at = now()
   where delivered_at is null
     and exists (
       select 1 from public.profiles p
        join public.app_members m on m.user_id = p.user_id
       where extract(hour from now() at time zone coalesce(p.timezone, 'Asia/Almaty'))::int = 9
         and public.letters.deliver_on <= (now() at time zone coalesce(p.timezone, 'Asia/Almaty'))::date
     );

  return sent;
end;
$$;

revoke execute on function public.deliver_letters() from public, anon, authenticated;

select cron.schedule('letters', '0 * * * *', $$ select public.deliver_letters() $$);
