-- Ежедневная записка на языке получателя.
--
-- До сих пор у записки был только русский текст: одна строка на дату.
-- Переключив язык, человек получал переведённый заголовок «Remember»
-- и русскую записку под ним - то есть ровно ту половинчатость, которая
-- хуже, чем честно оставить всё по-русски.
--
-- Первичный ключ становится составным: дата + язык. Три строки на день,
-- по одной на язык, и отправка берёт ту, что совпадает с профилем.
--
-- Запасной вариант - русский. Он тут не «язык по умолчанию», а гарантия:
-- если для какой-то даты перевода не окажется, человек получит записку,
-- а не тишину. Что таких дыр нет, следит scripts/check-love-notes.ts.

alter table public.love_notes
  add column lang text not null default 'ru' check (lang in ('ru', 'kk', 'en'));

alter table public.love_notes drop constraint love_notes_pkey;
alter table public.love_notes add primary key (on_date, lang);

comment on column public.love_notes.lang is
  'Язык записки. На каждую дату по строке на язык; отправка берёт язык профиля.';

-- ---------------------------------------------------------------------------
-- Отправка выбирает язык получателя, а не первый попавшийся текст.

create or replace function public.send_love_notes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  note text;
  partner_nick text;
  today date;
  local_now timestamp;
  lang text;
  sent int := 0;
begin
  for person in
    select p.user_id, coalesce(p.timezone, 'Asia/Almaty') as tz
      from public.profiles p
      join public.app_members m on m.user_id = p.user_id
  loop
    local_now := now() at time zone person.tz;
    today := local_now::date;

    if extract(hour from local_now)::int <> 18 then
      continue;
    end if;

    if exists (
      select 1 from public.love_notes_sent s
       where s.user_id = person.user_id and s.on_date = today
    ) then
      continue;
    end if;

    lang := public.lang_of(person.user_id);

    select n.message into note
      from public.love_notes n
     where n.on_date = today and n.lang = lang;

    -- Перевода на этот день нет - шлём русский, а не молчим. Молчание
    -- выглядело бы как поломка рассылки, а не как пробел в словаре.
    if note is null then
      select n.message into note
        from public.love_notes n
       where n.on_date = today and n.lang = 'ru';
    end if;

    -- Даты кончились - молчим. Слать по кругу значило бы нарушить
    -- то самое условие, ради которого тексты и писались по одному.
    if note is null then
      continue;
    end if;

    select p2.nickname into partner_nick
      from public.profiles p2
      join public.app_members m2 on m2.user_id = p2.user_id
     where p2.user_id <> person.user_id
     limit 1;

    note := replace(
      note, '{partner}',
      coalesce(partner_nick, public.tx(person.user_id, 'n.loveNote.partner')));

    perform public.tg_notify_self(person.user_id, note, 'love_notes');
    perform public.push_notify(
      person.user_id, public.tx(person.user_id, 'n.loveNote.title'), note, 'love_notes');

    insert into public.love_notes_sent (user_id, on_date)
    values (person.user_id, today) on conflict do nothing;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;
