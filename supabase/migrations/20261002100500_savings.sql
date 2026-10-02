-- Копилка на цель.
--
-- Общая цель в деньгах: поездка, свадьба, ребёнок. Каждый откладывает
-- своё, оба видят общую шкалу, вклад каждого и темп - успеваете ли к сроку.
-- Не бюджет и не учёт расходов: одна понятная цифра «сколько осталось»
-- мотивирует, а таблица трат - нет.
--
-- Сумма вклада со знаком: минус - взяли из копилки. Отдельной таблицы
-- для изъятий нет, потому что история одна и баланс считается одной суммой.

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 80),
  icon text not null check (icon ~ '^[a-z_]{1,30}$'),
  target numeric(14, 2) not null check (target > 0 and target <= 1000000000000),
  currency text not null check (currency in ('KZT', 'RUB', 'USD', 'EUR')),
  deadline date,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.savings_goals is
  'Цели копилки. Правят оба; вклады - в savings_deposits.';

create table public.savings_deposits (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  amount numeric(14, 2) not null check (amount <> 0 and abs(amount) <= 1000000000000),
  date date not null,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);

create index savings_deposits_goal on public.savings_deposits (goal_id, date desc, created_at desc);

alter table public.savings_goals enable row level security;
alter table public.savings_deposits enable row level security;
revoke all on public.savings_goals from anon;
revoke all on public.savings_deposits from anon;

create policy savings_goals_select on public.savings_goals for select to authenticated
  using (public.is_member());
create policy savings_goals_insert on public.savings_goals for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()));
create policy savings_goals_update on public.savings_goals for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy savings_goals_delete on public.savings_goals for delete to authenticated
  using (public.is_member());

-- Вклады видят оба, вносит и правит каждый свои: чужие деньги
-- не переписываются задним числом
create policy savings_deposits_select on public.savings_deposits for select to authenticated
  using (public.is_member());
create policy savings_deposits_insert on public.savings_deposits for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy savings_deposits_update on public.savings_deposits for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy savings_deposits_delete on public.savings_deposits for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

-- В копилке не бывает меньше нуля: взять больше, чем отложено, нельзя -
-- ни новым изъятием, ни удалением старого вклада
create or replace function public.savings_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  goal uuid := coalesce(new.goal_id, old.goal_id);
begin
  if (select coalesce(sum(d.amount), 0) from public.savings_deposits d where d.goal_id = goal) < 0 then
    raise exception 'savings_not_negative: в копилке не может быть меньше нуля'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function public.savings_balance_guard() from public, anon, authenticated;

-- Отложенный constraint-триггер: проверяем баланс после всей команды,
-- а не на каждой строке, иначе перенос суммы в одной транзакции падал бы
create constraint trigger savings_balance_guard
  after insert or update or delete on public.savings_deposits
  deferrable initially immediate
  for each row execute function public.savings_balance_guard();

-- ---------------------------------------------------------------------------
-- Сумма словами получателя: «12 500 ₸». Разряды через пробел, копейки -
-- только если они есть
create or replace function public.money_fmt(n numeric, cur text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when n < 0 then '-' else '' end
    || regexp_replace(trunc(abs(n))::bigint::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g')
    || case when abs(n) <> trunc(abs(n))
            then ',' || lpad(round((abs(n) - trunc(abs(n))) * 100)::int::text, 2, '0')
            else '' end
    || ' ' || case cur when 'KZT' then '₸' when 'RUB' then '₽' when 'USD' then '$' when 'EUR' then '€' else cur end
$$;

insert into public.texts (key, lang, value) values
  ('n.savings.deposit.male', 'ru', '%1$s отложил %2$s'),
  ('n.savings.deposit.female', 'ru', '%1$s отложила %2$s'),
  ('n.savings.deposit.other', 'ru', '%1$s отложил(а) %2$s'),
  ('n.savings.deposit.male', 'kk', '%1$s жинаққа %2$s салды'),
  ('n.savings.deposit.female', 'kk', '%1$s жинаққа %2$s салды'),
  ('n.savings.deposit.other', 'kk', '%1$s жинаққа %2$s салды'),
  ('n.savings.deposit.male', 'en', '%1$s saved %2$s'),
  ('n.savings.deposit.female', 'en', '%1$s saved %2$s'),
  ('n.savings.deposit.other', 'en', '%1$s saved %2$s'),
  ('n.savings.withdraw.male', 'ru', '%1$s взял из копилки %2$s'),
  ('n.savings.withdraw.female', 'ru', '%1$s взяла из копилки %2$s'),
  ('n.savings.withdraw.other', 'ru', '%1$s взял(а) из копилки %2$s'),
  ('n.savings.withdraw.male', 'kk', '%1$s жинақтан %2$s алды'),
  ('n.savings.withdraw.female', 'kk', '%1$s жинақтан %2$s алды'),
  ('n.savings.withdraw.other', 'kk', '%1$s жинақтан %2$s алды'),
  ('n.savings.withdraw.male', 'en', '%1$s took %2$s from savings'),
  ('n.savings.withdraw.female', 'en', '%1$s took %2$s from savings'),
  ('n.savings.withdraw.other', 'en', '%1$s took %2$s from savings'),
  ('n.savings.progress', 'ru', '«%1$s»: %2$s из %3$s - %4$s%%.'),
  ('n.savings.progress', 'kk', '«%1$s»: %3$s ішінен %2$s - %4$s%%.'),
  ('n.savings.progress', 'en', '“%1$s”: %2$s of %3$s - %4$s%%.'),
  ('n.savings.reached', 'ru', 'Цель достигнута'),
  ('n.savings.reached', 'kk', 'Мақсатқа жеттіңдер'),
  ('n.savings.reached', 'en', 'Goal reached'),
  ('n.savings.reachedBody', 'ru', '«%1$s» - %2$s. Вы смогли!'),
  ('n.savings.reachedBody', 'kk', '«%1$s» - %2$s. Сендер жеттіңдер!'),
  ('n.savings.reachedBody', 'en', '“%1$s” - %2$s. You did it!')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_savings_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  g record;
  saved numeric;
  before numeric;
  title text;
  body text;
begin
  target := public.partner_of(new.user_id);
  if target is null then
    return new;
  end if;
  select sg.title, sg.target, sg.currency into g from public.savings_goals sg where sg.id = new.goal_id;
  select coalesce(sum(d.amount), 0) into saved from public.savings_deposits d where d.goal_id = new.goal_id;
  before := saved - new.amount;

  -- Пересекли цель этим вкладом - это главное событие, и о нём говорим
  -- отдельно, а не очередным «отложил»
  if before < g.target and saved >= g.target then
    title := public.tx(target, 'n.savings.reached');
    body := public.tx(target, 'n.savings.reachedBody', g.title, public.money_fmt(saved, g.currency));
  else
    title := public.tx_by(
      target, new.user_id,
      case when new.amount > 0 then 'n.savings.deposit' else 'n.savings.withdraw' end,
      public.nick_for(target, new.user_id),
      public.money_fmt(abs(new.amount), g.currency));
    body := public.tx(target, 'n.savings.progress',
                      g.title,
                      public.money_fmt(saved, g.currency),
                      public.money_fmt(g.target, g.currency),
                      least(floor(saved * 100 / g.target), 999)::int::text);
  end if;

  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || public.tg_escape(body),
    'savings');
  perform public.push_notify(target, title, body, 'savings', '/savings');
  return new;
end;
$$;

revoke execute on function public.tg_on_savings_deposit() from public, anon, authenticated;

create trigger savings_deposits_notify
  after insert on public.savings_deposits
  for each row execute function public.tg_on_savings_deposit();
