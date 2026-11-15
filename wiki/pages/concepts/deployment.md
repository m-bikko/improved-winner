---
title: Деплой и окружения
type: concept
tags: [deployment, vercel, supabase, migrations]
created: 2026-09-03
updated: 2026-11-15
sources: [vercel.json, scripts/db.ts]
---

# Деплой и окружения

## Миграции идут через CLI, не через MCP

На машине разработки Supabase CLI может быть авторизован под одним аккаунтом,
MCP-сервер привязан к другому проекту, а нужный проект - третий. Это не
гипотетическая ситуация: при первой сборке MCP смотрел в чужую продакшн-базу,
и `apply_migration` через него положил бы схему туда.

Поэтому `scripts/db.ts` всегда ходит по строке подключения из `.env`, а цель
задана явно и всегда одна. Инструменты `mcp__supabase__*` в этом проекте
не используются.

Строка подключения - session-mode пулер на порту 5432. Транзакционный на 6543
для DDL не годится.

Отдельная особенность: `pg` версии 8 трактует `sslmode=require` из строки
подключения как `verify-full`, а пулер Supabase отдаёт цепочку со своим CA.
Поэтому `pgConfig()` вырезает `sslmode` и задаёт ssl объектом - иначе
«self-signed certificate in certificate chain».

## Vercel

**SPA-fallback обязан исключать пути с расширением.** Широкий rewrite
`/(.*) → /index.html` перехватил бы `/sw.js` и `/manifest.webmanifest`, и
Service Worker зарегистрировался бы с MIME-типом HTML.

**Заголовки кэша.** `sw.js`, `index.html` и манифест - `max-age=0,
must-revalidate`; хэшированные ассеты - `immutable`. Закэшированный на CDN
`sw.js` означает, что обновления не доедут неделями.

**Preview-деплои публичны по URL.** Защита - только PIN, плюс `X-Robots-Tag:
noindex` и `robots.txt`. Если это неприемлемо, включать Deployment Protection.

**Переменные окружения.** В браузер попадает только то, что начинается с
`VITE_`. Серверный код у приложения один - функция отправки push `api/push.ts`,
и секреты в переменных Vercel нужны только ей.

## Переменные

| Переменная | Где нужна |
|---|---|
| `VITE_PUBLIC_SUPABASE_URL` | клиент, Vercel |
| `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | клиент, Vercel |
| `VITE_PUBLIC_APP_NAME`, `VITE_PUBLIC_APP_SHORT_NAME` | клиент, Vercel |
| `VITE_PUBLIC_PARTNER_1_NAME`, `_2_NAME` | клиент и Vercel; локально их пишут в профили `pnpm couple` и `pnpm bootstrap` |
| `VITE_PUBLIC_VAPID_KEY` | клиент и функция push, Vercel |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | функция push, Vercel |
| `PUSH_SHARED_SECRET` | функция push на Vercel и Vault (через `pnpm secrets`) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | функция push на Vercel; локально - Admin API |
| `PUSH_ENDPOINT_URL`, `TELEGRAM_BOT_ID` | только локально, `pnpm secrets` кладёт их в Vault |
| `POSTGRES_URL_NON_POOLING` | только локально, миграции |
| `LOVE_PIN_*` | только локально, `pnpm couple` и `pnpm bootstrap` |
| `PARTNER_1_TIMEZONE`, `PARTNER_1_LANGUAGE` и `PARTNER_2_*` | только локально, `pnpm couple` |

Новая пара ставится по [[new-couple-setup]].

## См. также

- [[security]] - обращение с ключами
- [[offline]] - почему стратегия обновления именно `prompt`
