/**
 * Проверка ежедневных напоминаний о любви.
 *
 *   pnpm tsx scripts/check-love-notes.ts
 *
 * Главное здесь - уникальность и покрытие: условие было «каждый день свой
 * текст, без повторов», и нарушение видно не сразу. Человек заметит повтор
 * только когда получит его второй раз, то есть спустя месяцы.
 *
 * Всё в транзакции и откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  try {
    await client.query('begin')

    const { rows: cover } = await client.query<{
      total: string
      uniq: string
      first: string
      last: string
      gaps: string
    }>(
      `select count(*)::text as total,
              count(distinct message)::text as uniq,
              min(on_date)::text as first,
              max(on_date)::text as last,
              ((max(on_date) - min(on_date) + 1) - count(*))::text as gaps
         from public.love_notes`,
    )
    const c = cover[0]
    check(
      c !== undefined && c.total === c.uniq,
      'Все тексты уникальны',
      `${c?.total} строк, ${c?.uniq} разных`,
    )
    check(c?.gaps === '0', 'В диапазоне нет пропущенных дней', `пропусков: ${c?.gaps}`)
    check(
      c?.first === '2026-09-06' && c?.last === '2029-01-01',
      'Диапазон тот, что просили',
      `${c?.first} - ${c?.last}`,
    )

    const { rows: empty } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.love_notes where length(btrim(message)) < 10`,
    )
    check(empty[0]?.n === '0', 'Нет пустых и обрубленных текстов', `коротких: ${empty[0]?.n}`)

    const { rows: ph } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.love_notes where message like '%{partner}%'`,
    )
    check(
      Number(ph[0]?.n) > 0,
      'Часть текстов обращается к партнёру по имени',
      `с подстановкой имени: ${ph[0]?.n}`,
    )

    // Подстановка не должна оставлять фигурных скобок в готовом сообщении
    const { rows: sub } = await client.query<{ bad: string }>(
      `select count(*)::text as bad from public.love_notes
        where replace(message, '{partner}', 'Имя') like '%{%'`,
    )
    check(sub[0]?.bad === '0', 'После подстановки скобок не остаётся', `осталось в ${sub[0]?.bad}`)

    // Час: подбираем пояс, где сейчас 18, и пояс, где 3
    const zone = async (hour: number): Promise<string | null> => {
      const { rows } = await client.query<{ name: string }>(
        `select name from pg_timezone_names
          where extract(hour from now() at time zone name)::int = $1
            and name like '%/%' order by name limit 1`,
        [hour],
      )
      return rows[0]?.name ?? null
    }
    const evening = await zone(18)
    const night = await zone(3)

    const queued = async (): Promise<number> => {
      const { rows } = await client.query<{ n: string }>(
        'select count(*)::text as n from net.http_request_queue',
      )
      return Number(rows[0]?.n ?? 0)
    }

    if (evening && night) {
      const { rows: members } = await client.query<{ n: string }>(
        'select count(*)::text as n from public.app_members',
      )
      const memberCount = Number(members[0]?.n ?? 0)

      await client.query('update public.profiles set timezone = $1', [night])
      const beforeNight = await queued()
      await client.query('select public.send_love_notes()')
      check(
        (await queued()) === beforeNight,
        'В неурочный час ничего не уходит',
        `${night}, запросов не прибавилось`,
      )

      await client.query('update public.profiles set timezone = $1', [evening])
      await client.query('delete from public.love_notes_sent')

      // Текста на сегодня может не быть: пояс, где сейчас 18:00, нередко
      // живёт другой датой, и она выпадает за диапазон. Раньше проверка
      // в этом случае просто пропускала отправку - то есть сам путь
      // доставки не проверялся вовсе, и дыру было видно только по строке
      // «ПРОП» в выводе. Теперь недостающую строку заводим сами: транзакция
      // всё равно откатывается.
      await client.query(
        `insert into public.love_notes (on_date, message)
         values ((now() at time zone $1)::date, 'ТЕСТ: помни, как ты любима, {partner}')
         on conflict (on_date) do nothing`,
        [evening],
      )
      const hasToday = await client.query<{ n: string }>(
        `select count(*)::text as n from public.love_notes
          where on_date = (now() at time zone $1)::date`,
        [evening],
      )
      const beforeEvening = await queued()
      const { rows: sentRows } = await client.query<{ n: string }>(
        'select public.send_love_notes()::text as n',
      )
      const delta = (await queued()) - beforeEvening

      if (hasToday.rows[0]?.n === '1') {
        check(
          delta === memberCount * 2,
          'В 18:00 уходит обоим, двумя каналами',
          `участников ${memberCount}, запросов ${delta} (ожидалось ${memberCount * 2})`,
        )

        const { rows: body } = await client.query<{ body: string }>(
          `select convert_from(q.body, 'utf8') as body from net.http_request_queue q
            order by q.id desc limit 1`,
        )
        check(
          !(body[0]?.body ?? '').includes('{partner}'),
          'Имя партнёра подставлено, а не осталось шаблоном',
          (body[0]?.body ?? '').slice(0, 90),
        )

        const beforeRepeat = await queued()
        await client.query('select public.send_love_notes()')
        check(
          (await queued()) === beforeRepeat,
          'Повторный запуск в тот же день молчит',
          'задание идёт каждый час - дубли недопустимы',
        )
      } else {
        console.log(
          `  ПРОП  сегодняшней даты нет в диапазоне (отправлено ${sentRows[0]?.n}) - рассылка законно молчит`,
        )
      }
    }
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }

  console.log(failed === 0 ? '\nЕжедневные напоминания верны.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
