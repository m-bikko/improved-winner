-- Расширение запасного пути в поиске по темам.
--
-- Что проверено на живом Postgres:
--   to_tsvector('russian', 'отпуск отпуска отпуске') → 'отпуск':1,2,3   ← работает
--   to_tsvector('russian', 'обсуждение обсудили')    → 'обсужден', 'обсуд'  ← разные основы
--
-- То есть snowball-стеммер берёт словоформы одного слова (падежи, числа,
--формы глагола), но не связывает однокоренные слова разных частей речи:
-- «обсуждение» и «обсудить» для него разные, как «творог» и «творожок».
-- Лемматизатор это бы решил, но словарей ispell на managed Supabase нет.
--
-- Поэтому подстрочный запасной путь расширяем с одного заголовка на весь текст
-- темы: тогда «обсужд» находит «обсуждение», даже если стеммер не помог.

create or replace function public.search_topics(q text)
returns setof public.topics
language sql
stable
set search_path = ''
as $$
  with cleaned as (
    select nullif(
      btrim(regexp_replace(
        lower(translate(coalesce(q, ''), 'ёЁ', 'еЕ')),
        '[^[:alnum:][:space:]]+', ' ', 'g'
      )),
      ''
    ) as s
  ),
  built as (
    select
      s,
      case
        when s is null then null
        else to_tsquery(
          'pg_catalog.russian'::regconfig,
          (select string_agg(w || ':*', ' & ')
             from regexp_split_to_table(s, '\s+') as w
            where w <> '')
        )
      end as tsq
    from cleaned
  )
  select t.*
  from public.topics t
  cross join built b
  where b.s is null
     or t.search_tsv @@ b.tsq
     or lower(translate(
          coalesce(t.title, '') || ' ' || coalesce(t.body, '') || ' ' || coalesce(t.resolution, ''),
          'ёЁ', 'еЕ'
        )) like '%' || b.s || '%'
  order by
    case when b.tsq is null then 0 else ts_rank(t.search_tsv, b.tsq) end desc,
    t.created_at desc
  limit 200;
$$;

revoke execute on function public.search_topics(text) from public, anon;
grant execute on function public.search_topics(text) to authenticated;
