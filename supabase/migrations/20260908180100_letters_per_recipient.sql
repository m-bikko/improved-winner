-- Доставка писем ведётся по адресатам, а не одной отметкой на письмо.
--
-- В первой редакции letters.delivered_at ставился, как только наступило
-- девять утра хоть у кого-то. Пока оба живут в одном поясе, это работает
-- и выглядит правильным; стоит одному уехать - и письмо «обоим» пометится
-- доставленным после первого получателя, а второй не увидит его никогда.
--
-- Тот же приём, что у важных дат: журнал (письмо, человек). Заодно
-- он уточняет и политику чтения - «доставлено МНЕ», а не «доставлено вообще».

create table public.letter_deliveries (
  letter_id uuid not null references public.letters (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (letter_id, user_id)
);

alter table public.letter_deliveries enable row level security;
revoke all on public.letter_deliveries from anon;

create policy letter_deliveries_select on public.letter_deliveries
  for select to authenticated using (public.is_member());

-- Кому это письмо предназначено
create or replace function public.letter_recipients(letter uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
    from public.app_members m, public.letters l
   where l.id = letter
     and (l.audience = 'both' or m.user_id <> l.author_id)
$$;

revoke execute on function public.letter_recipients(uuid) from public, anon, authenticated;

drop policy letters_select on public.letters;

create policy letters_select on public.letters for select to authenticated
  using (
    public.is_member()
    and (
      author_id = (select auth.uid())
      or exists (
        select 1 from public.letter_deliveries d
         where d.letter_id = id and d.user_id = (select auth.uid())
      )
    )
  );

create or replace function public.deliver_letters()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  letter record;
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
       where l.deliver_on <= (now() at time zone person.tz)::date
         and person.user_id in (select public.letter_recipients(l.id))
         and not exists (
           select 1 from public.letter_deliveries d
            where d.letter_id = l.id and d.user_id = person.user_id
         )
       order by l.deliver_on
       limit 20
    loop
      -- Отметка ДО отправки: упавшая отправка потеряет письмо, зато
      -- не превратит его в ежечасную рассылку одного и того же
      insert into public.letter_deliveries (letter_id, user_id)
      values (letter.id, person.user_id)
      on conflict do nothing;

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

  -- Письмо считается доставленным, когда его получили ВСЕ адресаты
  update public.letters l
     set delivered_at = now()
   where l.delivered_at is null
     and not exists (
       select 1 from public.letter_recipients(l.id) r
        where not exists (
          select 1 from public.letter_deliveries d
           where d.letter_id = l.id and d.user_id = r
        )
     );

  return sent;
end;
$$;

revoke execute on function public.deliver_letters() from public, anon, authenticated;
