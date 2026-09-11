/**
 * Проверка словаря рассылок.
 *
 *   pnpm tsx scripts/check-texts.ts
 *
 * Промах по ключу в базе не падает и не пишет в лог: tx() вернёт сам ключ,
 * и человек получит уведомление с текстом «n.topic.pushNewTitle». Заметить
 * это можно только получив такое уведомление - то есть уже после того, как
 * оно ушло. Поэтому ключи сверяются здесь.
 *
 * Четыре разных вопроса:
 *
 * Полнота. У каждого ключа ровно три языка. Пропуск не сломает отправку,
 * но тихо вернёт русский текст человеку, который его не читает.
 *
 * Достижимость. Каждый ключ, который упоминают функции, есть в таблице -
 * и наоборот, неиспользуемых ключей нет. Второе не ошибка, но накопившийся
 * мусор мешает понять, какие тексты живые.
 *
 * Подстановки. Перевод не ссылается на номер, которого нет в русском:
 * format() падает, если аргумент под этим номером не передан.
 *
 * Множественное число. tx_plural() в базе повторяет pluralFor() из приложения,
 * и разойтись они не должны. Спрашиваем саму функцию, а не переписанное
 * рядом правило: переписанное согласуется с приложением ровно до того дня,
 * когда кто-нибудь поправит базу и забудет про проверку.
 *
 * И, наконец, главное: что рассылки этим словарём ПОЛЬЗУЮТСЯ. Полный словарь
 * при русских строках, зашитых в функции, выглядит здоровым и не работает.
 * Поэтому в конце заводится тема от лица одного участника, второму ставится
 * английский, и в очереди проверяется, на каком языке ушёл текст.
 *
 * Всё, что пишется, делается в транзакции и откатывается.
 */
import { Client } from 'pg'
import { pgConfig } from './env.ts'
import { pluralFor, LANGS, type Lang } from '../src/lib/i18n/lang.ts'

let failed = 0

function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

/** Номера подстановок в шаблоне: %1$s, %2$s… */
function slots(value: string): number[] {
  return [...new Set([...value.matchAll(/%(\d+)\$s/g)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  )
}

async function main(): Promise<void> {
  const client = new Client(pgConfig())
  await client.connect()
  try {
    const { rows } = await client.query<{ key: string; lang: string; value: string }>(
      'select key, lang, value from public.texts order by key, lang',
    )

    const byKey = new Map<string, Map<string, string>>()
    for (const r of rows) {
      let langs = byKey.get(r.key)
      if (!langs) {
        langs = new Map()
        byKey.set(r.key, langs)
      }
      langs.set(r.lang, r.value)
    }

    const incomplete = [...byKey.entries()].filter(([, langs]) => langs.size !== 3)
    check(
      incomplete.length === 0 && byKey.size > 0,
      'Каждый ключ есть на трёх языках',
      `ключей ${byKey.size}, строк ${rows.length}` +
        (incomplete.length > 0 ? `, неполных: ${incomplete.map(([k]) => k).join(', ')}` : ''),
    )

    // Ключи, которые упоминают функции. Берём из определений: строковые
    // литералы, похожие на ключ словаря, плюс склейки вида 'n.meal.' || meal
    const { rows: defs } = await client.query<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'`,
    )
    const source = defs.map((d) => d.def).join('\n')

    const used = new Set<string>()
    for (const m of source.matchAll(/'((?:n|e)\.[A-Za-z][\w.]*)'/g)) used.add(m[1] ?? '')
    // Склейка: 'n.meal.' || target_meal - тут ключ достраивается на ходу,
    // и точное имя из текста функции не вытащить. Считаем достижимыми все,
    // что начинаются с такого префикса
    const prefixes = [...source.matchAll(/'((?:n|e)\.[\w.]*\.)'\s*\|\|/g)].map((m) => m[1] ?? '')
    // tx_sex дописывает род, tx_plural - форму числа
    const suffixes = ['male', 'female', 'other', 'one', 'few', 'many']

    const reachable = (key: string): boolean => {
      if (used.has(key)) return true
      if (prefixes.some((p) => key.startsWith(p))) return true
      const cut = key.lastIndexOf('.')
      if (cut < 0) return false
      const base = key.slice(0, cut)
      return suffixes.includes(key.slice(cut + 1)) && used.has(base)
    }

    const keys = [...byKey.keys()]
    // Ключ из функции считается найденным, если он есть сам - или если это
    // основа, к которой tx_sex/tx_plural дописывают окончание, либо префикс,
    // к которому имя достраивается склейкой
    const found = (key: string): boolean =>
      byKey.has(key) ||
      suffixes.some((sfx) => byKey.has(`${key}.${sfx}`)) ||
      keys.some((k) => k.startsWith(key))

    const missing = [...used].filter((k) => !found(k))
    check(
      missing.length === 0,
      'Все ключи из функций есть в словаре',
      missing.length === 0
        ? `упомянуто ключей: ${used.size}`
        : `нет в словаре: ${missing.join(', ')}`,
    )

    const orphans = [...byKey.keys()].filter((k) => !reachable(k))
    check(
      orphans.length === 0,
      'Неиспользуемых ключей нет',
      orphans.length === 0 ? 'весь словарь достижим' : `никем не спрошены: ${orphans.join(', ')}`,
    )

    // Русский - источник: под него написано место вызова, и именно столько
    // аргументов туда придёт. Перевод, сославшийся на лишний номер, уронит
    // format() в момент отправки.
    //
    // Обратное - не ошибка: «Исполняется 30 лет» по-английски это «Turning 30»,
    // и слово «лет» там лишнее. Такие места считаем и показываем, но не валим.
    const extra: string[] = []
    let dropped = 0
    for (const [key, langs] of byKey) {
      const base = slots(langs.get('ru') ?? '')
      for (const [lang, value] of langs) {
        if (lang === 'ru') continue
        const mine = slots(value)
        if (mine.some((n) => !base.includes(n))) extra.push(`${key}/${lang}`)
        else if (mine.length < base.length) dropped++
      }
    }
    check(
      extra.length === 0,
      'Переводы не ссылаются на подстановки, которых нет в русском',
      extra.length === 0
        ? `номер %N$s сверх русского нигде не встречается; опущено подстановок: ${dropped}`
        : `format() упадёт на: ${extra.join(', ')}`,
    )

    // Правило множественного числа: спрашиваем саму tx_plural(), подложив
    // ей ключ, у которого формы названы своими именами
    await client.query('begin')
    const probes = [0, 1, 2, 4, 5, 11, 12, 21, 22, 25, 101, 111, 114]
    const wrong: string[] = []
    const { rows: members } = await client.query<{ user_id: string }>(
      'select user_id from public.app_members limit 1',
    )
    const who = members[0]?.user_id
    if (!who) throw new Error('Нужен хотя бы один участник')

    for (const form of ['one', 'few', 'many']) {
      for (const lang of LANGS) {
        await client.query(
          'insert into public.texts (key, lang, value) values ($1, $2, $3)',
          [`n.__probe.${form}`, lang, form],
        )
      }
    }

    for (const lang of LANGS) {
      await client.query('update public.profiles set language = $1 where user_id = $2', [lang, who])
      for (const n of probes) {
        const { rows: got } = await client.query<{ v: string }>(
          'select public.tx_plural($1, $2, $3) as v',
          [who, 'n.__probe', n],
        )
        const app = pluralFor(lang as Lang, n, 'one', 'few', 'many')
        if (got[0]?.v !== app) wrong.push(`${lang}/${n}: база ${got[0]?.v}, приложение ${app}`)
      }
    }
    await client.query('rollback')
    check(
      wrong.length === 0,
      'Множественное число считается одинаково в базе и в приложении',
      wrong.length === 0 ? `проверено ${LANGS.length * probes.length} случаев` : wrong.join('; '),
    )

    // Язык получателя, а не отправителя: тему заводит один, читает второй,
    // и текст обязан быть на языке второго
    await client.query('begin')
    const { rows: pair } = await client.query<{ user_id: string }>(
      'select user_id from public.app_members order by user_id',
    )
    const [reader, writer] = pair
    if (!reader || !writer) throw new Error('Нужны два участника')

    const sample: Record<string, string> = {}
    for (const lang of LANGS) {
      await client.query('update public.profiles set language = $1 where user_id = $2', [
        lang,
        reader.user_id,
      ])
      await client.query(
        `insert into public.topics (title, body, created_by) values ($1, 'тело', $2)`,
        [`ТЕСТ язык ${lang}`, writer.user_id],
      )
      const { rows: last } = await client.query<{ body: string }>(
        `select coalesce(convert_from(body, 'utf8'), '') as body
           from net.http_request_queue
          where url like '%/api/push' order by id desc limit 1`,
      )
      sample[lang] = last[0]?.body ?? ''
    }
    await client.query('rollback')

    const title = (lang: string): string => byKey.get('n.topic.pushNewTitle')?.get(lang) ?? ''
    // Пустая выборка прошла бы мимо includes() и сделала проверку
    // бессмысленной: сравнивать было бы не с чем
    const off = LANGS.filter((l) => {
      const body = sample[l] ?? ''
      return body === '' || !body.includes(title(l))
    })
    check(
      off.length === 0,
      'Рассылка собирает текст на языке получателя',
      off.length === 0
        ? `на новой теме: ${LANGS.map((l) => `${l} - «${title(l)}»`).join(', ')}`
        : `ушло не на своём языке: ${off.join(', ')}`,
    )
  } finally {
    await client.end()
  }

  console.log(failed === 0 ? '\nСловарь рассылок верен.' : `\nПровалено: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
