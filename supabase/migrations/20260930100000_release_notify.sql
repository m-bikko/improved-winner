-- Уведомление «вышло обновление».
--
-- Приложение живёт на домашнем экране, и новая версия до человека доезжает
-- только после навигации: Service Worker проверяет обновление, когда
-- открывается страница, а не когда приложение просто возвращается из фона.
-- Выкатили исправление - а у обоих на телефонах неделю висит старое.
--
-- Сигналом служит сам сайт, а не деплой. Раз в пять минут база спрашивает
-- у продакшена `/version.json`, который кладёт туда сборка. Версия сменилась -
-- значит новая сборка уже отдаётся, и её правда можно получить. Уведомление
-- по хуку деплоя могло бы прийти раньше, чем версия станет доступна, а ещё
-- потребовало бы Actions и секретов в GitHub.
--
-- Несколько выкатов за пять минут дают одно уведомление: база видит только
-- последнюю версию. Откат на уже виденную версию молчит.

alter table public.notification_settings drop constraint notification_settings_kind_check;
alter table public.notification_settings add constraint notification_settings_kind_check
  check (kind in (
    'meals', 'tasks', 'topics', 'cycle', 'cycle_tips', 'love_notes',
    'checkin', 'checkin_partner', 'dates', 'wishlist', 'letters',
    'nudge', 'gratitude', 'weigh_in', 'updates'
  ));

-- Все версии, которые видела база. Первичный ключ делает повторное
-- объявление той же версии невозможным, а не «маловероятным».
create table if not exists public.app_releases (
  version text primary key,
  seen_at timestamptz not null default now(),
  announced boolean not null default false
);

alter table public.app_releases enable row level security;
revoke all on public.app_releases from anon, public, authenticated;

-- Запросы к /version.json, ответа на которые ещё не разобрали.
-- pg_net асинхронный: запрос уходит после коммита, ответ ложится
-- в net._http_response, и прочитать его можно только в следующем запуске.
create table if not exists public.release_probes (
  id bigint primary key,
  created_at timestamptz not null default now()
);

alter table public.release_probes enable row level security;
revoke all on public.release_probes from anon, public, authenticated;

insert into public.texts (key, lang, value) values
  ('n.release.title', 'ru', '%s: вышло обновление'),
  ('n.release.title', 'kk', '%s: жаңарту шықты'),
  ('n.release.title', 'en', '%s has been updated'),
  ('n.release.body', 'ru', 'Откройте приложение и обновите любую страницу - новая версия подтянется.'),
  ('n.release.body', 'kk', 'Қосымшаны ашып, кез келген бетті жаңартыңыз - жаңа нұсқа жүктеледі.'),
  ('n.release.body', 'en', 'Open the app and refresh any page to get the new version.')
on conflict (key, lang) do update set value = excluded.value;

-- Увидели версию. Возвращает, сколько человек оповещено.
--
-- Самая первая версия только запоминается: иначе включение этой миграции
-- объявило бы «обновление», которого никто не делал. Отдельной функцией,
-- чтобы проверка могла подставить версию сама, без настоящего сайта.
create or replace function public.release_seen(p_version text, p_app_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_ever boolean;
  member record;
  sent int := 0;
  name text := coalesce(nullif(btrim(p_app_name), ''), 'Тандем');
begin
  if p_version is null or btrim(p_version) = '' then
    return 0;
  end if;

  first_ever := not exists (select 1 from public.app_releases);

  insert into public.app_releases (version, announced)
  values (p_version, not first_ever)
  on conflict (version) do nothing;

  -- Уже видели - ничего нового
  if not found or first_ever then
    return 0;
  end if;

  for member in select m.user_id from public.app_members m loop
    perform public.push_notify(
      member.user_id,
      public.tx(member.user_id, 'n.release.title', name),
      public.tx(member.user_id, 'n.release.body'),
      'updates',
      '/today'
    );
    perform public.tg_notify_self(
      member.user_id,
      '<b>' || public.tx(member.user_id, 'n.release.title', name) || '</b>' || E'\n\n'
        || public.tx(member.user_id, 'n.release.body'),
      'updates'
    );
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.release_seen(text, text) from anon, public, authenticated;

-- Раз в пять минут: разобрать ответы прошлых запросов и отправить новый.
create or replace function public.check_release()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint_url text;
  origin text;
  probe record;
  doc jsonb;
  request_id bigint;
begin
  for probe in
    select p.id, r.status_code, r.content
      from public.release_probes p
      join net._http_response r on r.id = p.id
     order by p.id
  loop
    if probe.status_code = 200 then
      begin
        doc := probe.content::jsonb;
        perform public.release_seen(doc ->> 'version', doc ->> 'name');
      exception
        when others then
          raise warning 'Release: не разобрал version.json - %', sqlerrm;
      end;
    end if;
    delete from public.release_probes where id = probe.id;
  end loop;

  -- Ответ, который так и не пришёл, ждать вечно незачем: pg_net хранит
  -- ответы шесть часов, дальше строка висела бы навсегда
  delete from public.release_probes where created_at < now() - interval '1 hour';

  -- Адрес сайта - тот же, куда база шлёт push, без /api/push. Второй
  -- секрет с тем же доменом разошёлся бы с первым при первом переезде
  select decrypted_secret into endpoint_url
    from vault.decrypted_secrets where name = 'push_endpoint_url' limit 1;
  if endpoint_url is null then return; end if;
  origin := regexp_replace(endpoint_url, '/api/push/?$', '');

  -- Метка времени в адресе - мимо любых кэшей между базой и сайтом
  request_id := net.http_get(
    url := origin || '/version.json',
    params := jsonb_build_object('t', extract(epoch from now())::bigint::text),
    timeout_milliseconds := 10000
  );
  insert into public.release_probes (id) values (request_id) on conflict do nothing;
exception
  when others then
    raise warning 'Release: проверка версии не удалась - %', sqlerrm;
end;
$$;

revoke execute on function public.check_release() from anon, public, authenticated;

select cron.schedule('release-check', '*/5 * * * *', 'select public.check_release()');
