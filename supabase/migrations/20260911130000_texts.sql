-- Тексты уведомлений на трёх языках.
--
-- До этой миграции рассылки собирали сообщения конкатенацией прямо в plpgsql:
-- «author || ' ' || did || ' тему'». Пока язык был один, это работало. На трёх
-- не работает совсем: в казахском глагол уходит в конец, в английском имя
-- перед ним, и порядок кусков нельзя выразить порядком операндов ||.
--
-- Поэтому сообщение целиком лежит строкой в таблице, а подстановки в нём
-- пронумерованы: format() понимает %1$s, и каждый язык расставляет номера
-- по-своему.
--
-- Род глагола свёрнут в ключ. В русском «завёл» и «завела» - разные слова,
-- в казахском и английском - одно и то же; развилка by_sex(), которая жила
-- в коде функций, превращается в три строки словаря, из которых две могут
-- совпадать. Так язык, где рода нет, не платит за язык, где он есть.

create table public.texts (
  key text not null,
  lang text not null check (lang in ('ru', 'kk', 'en')),
  value text not null check (length(btrim(value)) > 0),
  primary key (key, lang)
);

comment on table public.texts is
  'Тексты рассылок. Ключ + язык; подстановки нумерованные, как в format().';

alter table public.texts enable row level security;
revoke all on public.texts from anon, authenticated;

-- Читать никому не нужно: тексты разворачиваются внутри функций, которые
-- и так security definer. Политик нет - значит, доступа нет ни у кого,
-- кроме service_role.

-- ---------------------------------------------------------------------------
-- Язык получателя.
--
-- Отдельной функцией, потому что спрашивается в каждом сообщении, а профиль
-- может и отсутствовать: рассылка не должна падать из-за этого.

create or replace function public.lang_of(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.language from public.profiles p where p.user_id = person),
    'ru'
  )
$$;

revoke execute on function public.lang_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Текст по ключу на языке получателя.
--
-- Пропущенный ключ - это ошибка разработки, и молчать о ней нельзя: пустое
-- уведомление выглядит как сломанное приложение, а не как забытый перевод.
-- Поэтому при промахе возвращается сам ключ - его видно и в шторке, и в логе.
-- Что промахов нет, следит scripts/check-texts.ts.

create or replace function public.tx(target uuid, key text, variadic args text[] default '{}')
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  template text;
begin
  select t.value into template
    from public.texts t
   where t.key = tx.key and t.lang = public.lang_of(target);

  if template is null then
    select t.value into template
      from public.texts t
     where t.key = tx.key and t.lang = 'ru';
  end if;

  if template is null then
    return key;
  end if;

  if cardinality(args) = 0 then
    return template;
  end if;
  return format(template, variadic args);
end;
$$;

revoke execute on function public.tx(uuid, text, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Форма глагола по роду того, КТО сделал, на языке того, КТО читает.
--
-- Два разных человека в одном вызове, и путать их нельзя: «Аминош завела тему»
-- по-английски читает Бикош, и род тут от неё, а язык от него.

create or replace function public.tx_sex(target uuid, actor uuid, key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.tx(
    target,
    key || '.' || coalesce(
      (select p.sex from public.profiles p where p.user_id = actor),
      'other'
    )
  )
$$;

revoke execute on function public.tx_sex(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Множественное число на языке получателя.
--
-- Повторяет pluralFor() из src/lib/i18n/lang.ts - тот же выбор из трёх форм
-- для русского, из двух для английского и из одной для казахского, где
-- существительное после числительного не меняется вовсе.
--
-- Две реализации одного правила - плохо, но выбор между этим и обращением
-- из базы к коду приложения, которого у неё нет. Что они согласны, проверяет
-- scripts/check-texts.ts.

create or replace function public.tx_plural(target uuid, key text, n int)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lang text := public.lang_of(target);
  form text;
  abs_n int := abs(n);
begin
  if lang = 'kk' then
    form := 'one';
  elsif lang = 'en' then
    form := case when abs_n = 1 then 'one' else 'many' end;
  elsif abs_n % 100 between 11 and 19 then
    form := 'many';
  elsif abs_n % 10 = 1 then
    form := 'one';
  elsif abs_n % 10 between 2 and 4 then
    form := 'few';
  else
    form := 'many';
  end if;

  return public.tx(target, key || '.' || form);
end;
$$;

revoke execute on function public.tx_plural(uuid, text, int) from public, anon, authenticated;
