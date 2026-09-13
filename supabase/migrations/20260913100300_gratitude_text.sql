-- Заголовок уведомления о благодарности.
--
-- Тело не переводится и не режется: это то, что человек написал сам,
-- и оно короткое по определению. Переводится только рамка вокруг него.

insert into public.texts (key, lang, value) values
  ('n.gratitude.head', 'ru', '%1$s благодарит'),
  ('n.gratitude.head', 'kk', '%1$s алғыс айтады'),
  ('n.gratitude.head', 'en', '%1$s is thanking you')
on conflict (key, lang) do update set value = excluded.value;
