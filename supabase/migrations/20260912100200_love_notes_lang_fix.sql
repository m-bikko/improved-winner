-- «column reference "lang" is ambiguous».
--
-- В предыдущей миграции переменная названа `lang`, и в `where n.lang = lang`
-- plpgsql не может выбрать между колонкой и переменной - он не угадывает,
-- он падает. Рассылка при этом не молчала бы, а обрывалась с ошибкой.
--
-- Поймала это scripts/check-love-notes.ts на проверке «записка уходит
-- на языке получателя»: она впервые прогоняет отправку по всем трём языкам,
-- и ошибка вылезла на первом же.
--
-- Переменная переименована в want_lang. Заодно запросы к таблице сокращены
-- до одного: coalesce по двум подзапросам читается хуже, чем order by
-- с предпочтением нужного языка.

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
  want_lang text;
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

    want_lang := public.lang_of(person.user_id);

    -- Нужный язык, а если его нет - русский. Порядок задан явно, чтобы
    -- «запасной вариант» был виден в запросе, а не подразумевался
    select n.message into note
      from public.love_notes n
     where n.on_date = today and n.lang in (want_lang, 'ru')
     order by (n.lang = want_lang) desc
     limit 1;

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
