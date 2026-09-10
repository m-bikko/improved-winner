-- Письмо запечатывается по-настоящему: его не видит и автор.
--
-- До сих пор автор видел своё письмо всегда - чтобы можно было поправить
-- до срока. Но раздел «В пути» портил сюрприз ему самому, а для письма
-- «обоим» обессмысливал затею целиком: написал и тут же перечитываешь.
--
-- Теперь письмо исчезает из виду в момент отправки и появляется только
-- в свой день. Это делает его тем, чем оно называется, - письмом в будущее,
-- а не черновиком с отложенной доставкой.
--
-- Права на правку и удаление СОХРАНЕНЫ. Через интерфейс они недостижимы:
-- чтобы изменить строку, нужно знать её id, а увидеть его негде. Но запись
-- остаётся отзываемой запросом к базе - «сгоряча написал» случается,
-- и запечатывание должно быть трудно обратимым, а не невозможным.

drop policy letters_select on public.letters;

create policy letters_select on public.letters for select to authenticated
  using (
    public.is_member()
    and exists (
      select 1 from public.letter_deliveries d
       where d.letter_id = id and d.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Сколько своих писем в пути.
--
-- Одно число без дат и без текста. Без него написанное письмо исчезает
-- в никуда, и человек не может отличить «запечатано» от «не сохранилось».
--
-- Считаются ТОЛЬКО свои: узнать, что партнёр что-то написал, - уже спойлер.

create or replace function public.letters_in_flight()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.letters l
   where l.author_id = (select auth.uid())
     and l.delivered_at is null
     and public.is_member()
$$;

revoke execute on function public.letters_in_flight() from public, anon;
grant execute on function public.letters_in_flight() to authenticated;
