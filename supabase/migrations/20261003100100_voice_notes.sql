-- Голосовые записки.
--
-- На расстоянии голос значит больше текста: «доброе утро» своим голосом -
-- не то же самое, что «доброе утро» буквами. Записка до двух минут, второму
-- приходит уведомление, у автора видно, прослушано ли.
--
-- Адресата в таблице нет - людей двое, записка всегда второму (как у
-- благодарностей).

create table public.voice_notes (
  -- Id даёт клиент: файл загружается раньше строки, и путь строится от id
  id uuid primary key,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  path text not null unique,
  duration_ms int not null check (duration_ms between 500 and 180000),
  -- Огибающая громкости, до 64 столбиков 0..100: рисуется сразу,
  -- без скачивания звука
  peaks smallint[] not null
    check (cardinality(peaks) between 1 and 64 and 0 <= all (peaks) and 100 >= all (peaks)),
  created_at timestamptz not null default now(),
  listened_at timestamptz
);

create index voice_notes_recent on public.voice_notes (created_at desc);

comment on table public.voice_notes is
  'Голосовые записки второму. Слушатель может отметить только «прослушано».';

alter table public.voice_notes enable row level security;
revoke all on public.voice_notes from anon;

create policy voice_notes_select on public.voice_notes for select to authenticated
  using (public.is_member());
create policy voice_notes_insert on public.voice_notes for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));
create policy voice_notes_delete on public.voice_notes for delete to authenticated
  using (public.is_member() and author_id = (select auth.uid()));

-- «Прослушано» ставит тот, кому записка, - и только эту колонку.
-- Колоночное право, а не только политика: политика решает, какие строки,
-- а какие поля - решают права. Иначе слушатель мог бы переписать путь
-- к файлу или длительность
create policy voice_notes_listen on public.voice_notes for update to authenticated
  using (public.is_member() and author_id <> (select auth.uid()))
  with check (public.is_member() and author_id <> (select auth.uid()));

revoke update on public.voice_notes from authenticated;
grant update (listened_at) on public.voice_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Хранилище: 2 МБ (две минуты при 32 кбит/с - около 500 КБ), только звук.
-- Кладут в папку со своим id: строки в момент загрузки ещё нет

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 2097152,
        array['audio/mp4', 'audio/webm', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/x-m4a'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

create policy voice_notes_read on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-notes' and public.is_member());

create policy voice_notes_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voice-notes' and public.is_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy voice_notes_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'voice-notes' and public.is_member()
    and owner_id = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------

insert into public.texts (key, lang, value) values
  ('n.voice.added.male', 'ru', '%1$s записал голосовое'),
  ('n.voice.added.female', 'ru', '%1$s записала голосовое'),
  ('n.voice.added.other', 'ru', '%1$s записал(а) голосовое'),
  ('n.voice.added.male', 'kk', '%1$s дауыстық хабар жіберді'),
  ('n.voice.added.female', 'kk', '%1$s дауыстық хабар жіберді'),
  ('n.voice.added.other', 'kk', '%1$s дауыстық хабар жіберді'),
  ('n.voice.added.male', 'en', '%1$s sent a voice note'),
  ('n.voice.added.female', 'en', '%1$s sent a voice note'),
  ('n.voice.added.other', 'en', '%1$s sent a voice note')
on conflict (key, lang) do update set value = excluded.value;

create or replace function public.tg_on_voice_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  title text;
  body text;
begin
  target := public.partner_of(new.author_id);
  if target is null then
    return new;
  end if;
  title := public.tx_by(target, new.author_id, 'n.voice.added', public.nick_for(target, new.author_id));
  -- Длительность цифрами: «0:42» одинаково читается на всех языках
  body := (new.duration_ms / 60000)::text || ':' || lpad(((new.duration_ms / 1000) % 60)::text, 2, '0');
  perform public.tg_notify_partner(
    new.author_id,
    '<b>' || public.tg_escape(title) || '</b>' || E'\n\n' || body,
    'voice');
  perform public.push_notify(target, title, body, 'voice', '/voice');
  return new;
end;
$$;

revoke execute on function public.tg_on_voice_note() from public, anon, authenticated;

create trigger voice_notes_notify
  after insert on public.voice_notes
  for each row execute function public.tg_on_voice_note();
