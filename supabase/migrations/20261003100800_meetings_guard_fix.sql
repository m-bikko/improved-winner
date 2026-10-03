-- Пересечение встреч - только для правильных дат.
--
-- Проверка check-meetings поймала: при конце раньше начала триггер
-- meetings_guard (BEFORE) срабатывал раньше CHECK meetings_dates, строил
-- daterange с нижней границей больше верхней и падал с ошибкой Postgres
-- «range lower bound must be less than or equal to range upper bound».
-- Вставка всё равно отклонялась, но не той ошибкой, которую понимает
-- приложение. Перевёрнутые даты - забота CHECK, триггер их пропускает.

create or replace function public.meetings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ends_on >= new.starts_on and exists (
    select 1 from public.meetings m
     where m.id <> new.id
       and daterange(m.starts_on, m.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'meetings_no_overlap: на эти дни встреча уже есть'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
