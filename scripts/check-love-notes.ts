/**
 * Проверка ежедневных напоминаний о любви.
 *
 *   pnpm tsx scripts/check-love-notes.ts
 *
 * Главное здесь - уникальность и покрытие: условие было «каждый день свой
 * текст, без повторов», и нарушение видно не сразу. Человек заметит повтор
 * только когда получит его второй раз, то есть спустя месяцы.
 *
 * С тех пор как записка переводится, к этому добавилось второе покрытие -
 * по языкам. Дыра в нём не ломает отправку: запасной вариант отдаст русский,
 * и человек получит записку на чужом языке, ничего не заподозрив. Поэтому
 * полноту проверяет скрипт, а не поведение.
 *
 * Всё в транзакции и откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'
import { LANGS } from '../src/lib/i18n/lang.ts'

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

    // Уникальность и пропуски считаются ВНУТРИ языка: между языками один
    // и тот же день - это перевод, а не повтор
    const { rows: cover } = await client.query<{
      lang: string
      total: string
      uniq: string
      first: string
      last: string
      gaps: string
    }>(
      `select lang,
              count(*)::text as total,
              count(distinct message)::text as uniq,
              min(on_date)::text as first,
              max(on_date)::text as last,
              ((max(on_date) - min(on_date) + 1) - count(*))::text as gaps
         from public.love_notes group by lang order by lang`,
    )
    check(
      cover.length === LANGS.length && cover.every((r) => r.total === r.uniq),
      'Внутри каждого языка все тексты уникальны',
      cover.map((r) => `${r.lang}: ${r.total} строк, ${r.uniq} разных`).join('; '),
    )
    check(
      cover.every((r) => r.gaps === '0'),
      'В диапазоне нет пропущенных дней',
      cover.map((r) => `${r.lang}: ${r.gaps}`).join('; '),
    )
    check(
      cover.every((r) => r.first === '2026-09-06' && r.last === '2029-01-01'),
      'Диапазон тот, что просили',
      cover.map((r) => `${r.lang}: ${r.first} - ${r.last}`).join('; '),
    )

    // Дата без полного набора языков - это тихая дыра: отправка подставит
    // русский, и заметить её можно только здесь
    const { rows: partial } = await client.query<{ n: string; sample: string | null }>(
      `select count(*)::text as n, min(on_date)::text as sample
         from (select on_date from public.love_notes
                group by on_date having count(distinct lang) <> $1) t`,
      [LANGS.length],
    )
    check(
      partial[0]?.n === '0',
      'У каждой даты есть все три языка',
      partial[0]?.n === '0'
        ? `языков на дату: ${LANGS.length}`
        : `неполных дат: ${partial[0]?.n}, первая ${partial[0]?.sample}`,
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

    // Подстановка обязана быть на тех же датах во всех языках: потерянная
    // при переводе, она оставит фразу без имени, а лишняя вставит его дважды
    const { rows: drift } = await client.query<{ n: string; sample: string | null }>(
      `select count(*)::text as n, min(on_date)::text as sample
         from (select on_date
                 from public.love_notes
                group by on_date
               having count(*) filter (where message like '%{partner}%') not in (0, $1)) t`,
      [LANGS.length],
    )
    check(
      drift[0]?.n === '0',
      'Подстановка имени сохранена при переводе',
      drift[0]?.n === '0'
        ? 'во всех языках одной даты она либо есть, либо её нет'
        : `разошлась на ${drift[0]?.n} датах, первая ${drift[0]?.sample}`,
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
      for (const lang of LANGS) {
        await client.query(
          `insert into public.love_notes (on_date, lang, message)
           values ((now() at time zone $1)::date, $2, 'ТЕСТ ' || $2 || ': {partner}, помни')
           on conflict (on_date, lang) do nothing`,
          [evening, lang],
        )
      }
      const hasToday = await client.query<{ n: string }>(
        `select count(*)::text as n from public.love_notes
          where on_date = (now() at time zone $1)::date and lang = 'ru'`,
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

        // Записка на языке получателя. Без этой проверки полный перевод
        // и русская отправка выглядят одинаково: словарь есть, а выбора нет
        const [reader] = (
          await client.query<{ user_id: string }>('select user_id from public.app_members limit 1')
        ).rows
        const wrong: string[] = []
        for (const lang of LANGS) {
          // Сверяем с тем, что РЕАЛЬНО лежит в таблице на эту дату: подложить
          // свой текст нельзя - строки на сегодня уже есть, и вставка
          // с on conflict do nothing молча ничего не сделает
          const { rows: want } = await client.query<{ message: string }>(
            `select message from public.love_notes
              where on_date = (now() at time zone $1)::date and lang = $2`,
            [evening, lang],
          )
          const expected = (want[0]?.message ?? '').replace('{partner}', '').trim().slice(0, 24)
          if (expected === '') {
            wrong.push(`${lang} (нет текста)`)
            continue
          }

          await client.query('update public.profiles set language = $1 where user_id = $2', [
            lang,
            reader?.user_id,
          ])
          await client.query('delete from public.love_notes_sent')
          await client.query('select public.send_love_notes()')
          const { rows: last } = await client.query<{ body: string }>(
            `select convert_from(q.body, 'utf8') as body from net.http_request_queue q
              where q.url like '%/api/push' order by q.id desc limit 1`,
          )
          if (!(last[0]?.body ?? '').includes(expected)) wrong.push(lang)
        }
        check(
          wrong.length === 0,
          'Записка уходит на языке получателя',
          wrong.length === 0
            ? `проверено: ${LANGS.join(', ')}`
            : `ушло не на своём языке: ${wrong.join(', ')}`,
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
