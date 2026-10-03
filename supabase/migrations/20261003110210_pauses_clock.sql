-- Пауза: ранний конец - по часам базы.
--
-- «Закончить раньше» присылало время с телефона. Если его часы отстают от
-- сервера, конец оказывался раньше начала, и запрос падал на CHECK - кнопка
-- просто не работала. Теперь всё, что раньше «сейчас», становится «сейчас»,
-- а пауза, законченная в ту же секунду, когда начата, - допустима.

alter table public.pauses drop constraint pauses_length;
alter table public.pauses add constraint pauses_length
  check (ends_at >= started_at and ends_at <= started_at + interval '24 hours');

create or replace function public.pauses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Начало - сейчас, а не когда скажет клиент: иначе «пауза на сутки»
    -- растягивалась бы задним числом
    new.started_at := now();
    new.end_notified_at := null;
    if new.ends_at < now() + interval '1 minute' then
      raise exception 'pauses_guard: пауза короче минуты' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.started_by <> old.started_by or new.started_at <> old.started_at then
    raise exception 'pauses_guard: начало паузы не меняется' using errcode = '23514';
  end if;
  if new.ends_at <> old.ends_at then
    if old.closed_at is not null then
      raise exception 'pauses_guard: пауза уже закрыта' using errcode = '23514';
    end if;
    if new.ends_at > old.ends_at then
      raise exception 'pauses_guard: паузу можно только укоротить' using errcode = '23514';
    end if;
    if (select auth.uid()) is distinct from old.started_by then
      raise exception 'pauses_guard: закончить паузу раньше может только тот, кто её попросил'
        using errcode = '42501';
    end if;
    -- «Закончить раньше» - это «сейчас» по часам базы, а не телефона:
    -- отстающие на минуту часы дали бы конец раньше начала
    if new.ends_at < now() then
      new.ends_at := now();
    end if;
    -- Закончили раньше - «пауза закончилась» уходит сразу (триггер
    -- уведомлений), и ежеминутный прогон её уже не повторит
    if new.ends_at <= now() and old.end_notified_at is null then
      new.end_notified_at := now();
    end if;
  end if;
  if new.closed_at is not null and old.closed_at is null and old.ends_at > now() and new.ends_at > now() then
    raise exception 'pauses_guard: пауза ещё идёт' using errcode = '23514';
  end if;
  if old.closed_at is not null and new.closed_at is distinct from old.closed_at then
    raise exception 'pauses_guard: закрытая пауза не открывается' using errcode = '23514';
  end if;
  return new;
end;
$$;

