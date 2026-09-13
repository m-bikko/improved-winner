-- Штрихкод у продукта и журнал благодарностей.
--
-- Две несвязанные вещи в одной миграции, потому что обе - по колонке
-- и по таблице, и разносить их значило бы писать два одинаковых заголовка.

-- ---------------------------------------------------------------------------
-- Штрихкод.
--
-- Смысл не в сканере, а в том, что после ПЕРВОГО распознавания продукт
-- становится своим: второй раз его находит поиск по базе, без сети и без
-- чужого сервиса. Внешний справочник нужен ровно один раз на продукт.
--
-- Уникальность частичная: архивные не мешают завести товар заново, а живых
-- с одним кодом быть не должно - иначе сканер каждый раз выбирает наугад.
-- Блюда кода не имеют: у сваренного борща штрихкода не бывает.

alter table public.foods
  add column barcode text
  check (barcode is null or barcode ~ '^[0-9]{8,14}$');

alter table public.foods
  add constraint foods_barcode_product_only
  check (barcode is null or kind = 'product');

create unique index foods_barcode_live
  on public.foods (barcode)
  where barcode is not null and archived_at is null;

comment on column public.foods.barcode is
  'EAN/UPC. Заполняется при первом сканировании; дальше продукт находится по нему локально.';

-- ---------------------------------------------------------------------------
-- Благодарности.
--
-- Половина подсказок в приложении сводится к «заметь и назови вслух».
-- Назвать вслух - действие, которое забывается ровно потому, что его негде
-- совершить: тема для этого слишком тяжёлая, а сообщение в телеграме тонет.
--
-- Поэтому запись предельно короткая: одно поле и кнопка. Ни категорий,
-- ни оценок, ни ответов - всё это превратило бы благодарность в отчётность.
--
-- Адресат не хранится: людей двое, и благодарность всегда второму. Колонка
-- «кому» была бы колонкой, у которой одно возможное значение.

create table public.gratitudes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 500),
  created_at timestamptz not null default now()
);

create index gratitudes_recent on public.gratitudes (created_at desc);

comment on table public.gratitudes is
  'Короткие «спасибо за…». Видят оба, пишет каждый своё, адресат всегда второй.';

alter table public.gratitudes enable row level security;
revoke all on public.gratitudes from anon;

-- Читают оба: сказанное вслух должно быть услышано. Пишет и удаляет каждый
-- только своё - чужую благодарность нельзя ни подправить, ни стереть.
create policy gratitudes_select on public.gratitudes for select to authenticated
  using (public.is_member());

create policy gratitudes_insert on public.gratitudes for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));

create policy gratitudes_delete on public.gratitudes for delete to authenticated
  using (public.is_member() and author_id = (select auth.uid()));

-- Обновления нет намеренно: переписанное задним числом «спасибо» - это уже
-- другое «спасибо», и пусть будет новой записью.

-- ---------------------------------------------------------------------------
-- Уведомление партнёру.

create or replace function public.tg_on_gratitude()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author text;
  target uuid;
begin
  target := public.partner_of(new.author_id);
  if target is null then
    return new;
  end if;

  select nickname into author from public.profiles where user_id = new.author_id;
  author := coalesce(author, public.tx(target, 'n.partner'));

  -- Текст виден целиком: он короткий по определению, и прятать его за
  -- «посмотри в приложении» тут нечего - в отличие от темы, где за ссылкой
  -- стоит разговор, здесь за ней стояла бы одна строка
  perform public.tg_notify_partner(
    new.author_id,
    '<b>' || public.tg_escape(public.tx(target, 'n.gratitude.head', author)) || '</b>'
      || E'\n\n' || public.tg_escape(new.body),
    'gratitude');
  perform public.push_notify(
    target,
    public.tx(target, 'n.gratitude.head', author),
    new.body,
    'gratitude',
    '/today');

  return new;
end;
$$;

revoke execute on function public.tg_on_gratitude() from public, anon, authenticated;

create trigger gratitudes_notify
  after insert on public.gratitudes
  for each row execute function public.tg_on_gratitude();

-- Новый вид уведомлений в список настроек: без этого его нельзя ни выключить,
-- ни показать на экране настроек, а notify_allowed молча пропустит неизвестный
alter table public.notification_settings
  drop constraint notification_settings_kind_check;

alter table public.notification_settings
  add constraint notification_settings_kind_check check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters', 'nudge',
    'gratitude'
  ));
