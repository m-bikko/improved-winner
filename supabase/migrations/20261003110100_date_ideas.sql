-- Идеи для свиданий и список «хотим вместе».
--
-- Банк идей: дома, на расстоянии, в городе, в поездке. Каждый листает сам,
-- как имена малышу: вправо - хочу, влево - нет. Совпадения - идеи, которые
-- захотели оба, - и есть общий список «хотим вместе». Оттуда идею берут
-- в план встречи, а сделанную отмечают и записывают в воспоминания.
--
-- Голоса второго не видны вовсе - так же, как у имён: «нет» второго
-- не ранит, потому что о нём никто не узнает.
--
-- Тексты идей - в базе на трёх языках, а не в словарях: уведомлению
-- о совпадении нужно назвать идею на языке получателя. Свою идею
-- добавляют одной строкой, на том языке, на каком её написали.

create table public.date_ideas (
  key text primary key check (key ~ '^[a-z0-9_-]{1,60}$'),
  category text not null check (category in ('home', 'distance', 'city', 'trip')),
  title_ru text check (title_ru is null or length(btrim(title_ru)) between 1 and 60),
  title_en text check (title_en is null or length(btrim(title_en)) between 1 and 60),
  title_kk text check (title_kk is null or length(btrim(title_kk)) between 1 and 60),
  hint_ru text check (hint_ru is null or length(hint_ru) <= 120),
  hint_en text check (hint_en is null or length(hint_en) <= 120),
  hint_kk text check (hint_kk is null or length(hint_kk) <= 120),
  -- Своя идея: одна строка без перевода и кто добавил
  title text check (title is null or length(btrim(title)) between 1 and 80),
  created_by uuid references auth.users on delete cascade,
  -- Порядок показа банка. Своих - пусто: они показываются первыми
  rank int,
  created_at timestamptz not null default now(),
  constraint date_ideas_custom check (
    (created_by is null) = (title is null)
    and (created_by is not null or (title_ru is not null and title_en is not null and title_kk is not null))
  )
);

create unique index date_ideas_custom_unique on public.date_ideas (lower(btrim(title))) where title is not null;

comment on table public.date_ideas is
  'Банк идей для свиданий на трёх языках и свои идеи пары (title, created_by).';

create table public.idea_votes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  idea_key text not null references public.date_ideas on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, idea_key)
);

-- Сделано: одна отметка на идею, общая для двоих
create table public.idea_done (
  idea_key text primary key references public.date_ideas on delete cascade,
  done_on date not null,
  memory_id uuid references public.memories on delete set null,
  done_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.date_ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.idea_done enable row level security;
revoke all on public.date_ideas from anon;
revoke all on public.idea_votes from anon;
revoke all on public.idea_done from anon;

create policy date_ideas_select on public.date_ideas for select to authenticated using (public.is_member());
create policy date_ideas_insert on public.date_ideas for insert to authenticated
  with check (public.is_member() and created_by = (select auth.uid()) and title is not null);
create policy date_ideas_delete on public.date_ideas for delete to authenticated
  using (public.is_member() and created_by = (select auth.uid()));

create policy idea_votes_select on public.idea_votes for select to authenticated
  using (public.is_member() and user_id = (select auth.uid()));
create policy idea_votes_insert on public.idea_votes for insert to authenticated
  with check (public.is_member() and user_id = (select auth.uid()));
create policy idea_votes_update on public.idea_votes for update to authenticated
  using (public.is_member() and user_id = (select auth.uid()))
  with check (public.is_member() and user_id = (select auth.uid()));
create policy idea_votes_delete on public.idea_votes for delete to authenticated
  using (public.is_member() and user_id = (select auth.uid()));

create or replace function public.idea_votes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger idea_votes_touch before update on public.idea_votes
  for each row execute function public.idea_votes_touch();

-- Совпадения - единственное, что известно о голосах второго
create or replace function public.idea_matches()
returns table (idea_key text, matched_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.idea_key, max(greatest(v.updated_at, w.updated_at))
    from public.idea_votes v
    join public.idea_votes w on w.idea_key = v.idea_key and w.user_id <> v.user_id and w.liked
   where public.is_member()
     and v.user_id = (select auth.uid())
     and v.liked
   group by v.idea_key
$$;

revoke execute on function public.idea_matches() from public, anon;
grant execute on function public.idea_matches() to authenticated;

create or replace function public.idea_is_match(of_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.idea_votes v where v.idea_key = of_key and v.liked) >= 2
$$;

revoke execute on function public.idea_is_match(text) from public, anon;
grant execute on function public.idea_is_match(text) to authenticated;

-- Отметить сделанной можно только общую идею: список «хотим вместе» -
-- это совпадения, и отметка вне его значила бы, что список врёт
create policy idea_done_select on public.idea_done for select to authenticated using (public.is_member());
create policy idea_done_insert on public.idea_done for insert to authenticated
  with check (public.is_member() and done_by = (select auth.uid()) and public.idea_is_match(idea_key));
create policy idea_done_update on public.idea_done for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy idea_done_delete on public.idea_done for delete to authenticated using (public.is_member());

-- План встречи принимает пункты и из идей
alter table public.meeting_items drop constraint meeting_items_source_check;
alter table public.meeting_items add constraint meeting_items_source_check
  check (source is null or source in ('wish', 'watch', 'idea'));

-- ---------------------------------------------------------------------------
-- Уведомление о совпадении - второму, с названием идеи на его языке

insert into public.texts (key, lang, value) values
  ('n.ideas.match', 'ru', 'Совпадение в идеях'),
  ('n.ideas.match', 'kk', 'Идеяларда сәйкестік'),
  ('n.ideas.match', 'en', 'A date idea you both want'),
  ('n.ideas.matchBody', 'ru', 'Хотите оба: %1$s. Идея уже в списке «хотим вместе».'),
  ('n.ideas.matchBody', 'kk', 'Екеуің де қалайсыңдар: %1$s. Идея «бірге қалаймыз» тізімінде.'),
  ('n.ideas.matchBody', 'en', 'You both want: %1$s. It is already on your together list.')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.idea_title(of_key text, for_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    i.title,
    case public.lang_of(for_user) when 'en' then i.title_en when 'kk' then i.title_kk else i.title_ru end)
    from public.date_ideas i where i.key = of_key
$$;

revoke execute on function public.idea_title(text, uuid) from public, anon, authenticated;

create or replace function public.tg_on_idea_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  shown text;
begin
  if not new.liked or (tg_op = 'UPDATE' and old.liked) then
    return new;
  end if;
  target := public.partner_of(new.user_id);
  if target is null or not exists (
    select 1 from public.idea_votes w where w.user_id = target and w.idea_key = new.idea_key and w.liked
  ) then
    return new;
  end if;
  shown := public.idea_title(new.idea_key, target);
  perform public.tg_notify_partner(
    new.user_id,
    '<b>' || public.tg_escape(public.tx(target, 'n.ideas.match')) || '</b>' || E'\n\n'
      || public.tg_escape(public.tx(target, 'n.ideas.matchBody', shown)),
    'ideas');
  perform public.push_notify(
    target,
    public.tx(target, 'n.ideas.match'),
    public.tx(target, 'n.ideas.matchBody', shown),
    'ideas',
    '/ideas');
  return new;
end;
$$;

revoke execute on function public.tg_on_idea_match() from public, anon, authenticated;

create trigger idea_votes_match
  after insert or update of liked on public.idea_votes
  for each row execute function public.tg_on_idea_match();
