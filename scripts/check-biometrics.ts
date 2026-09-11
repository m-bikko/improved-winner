/**
 * Проверка хранилища для входа по Face ID.
 *
 *   pnpm tsx scripts/check-biometrics.ts
 *
 * Сам Face ID тут не проверить: платформенного ключа в headless-браузере
 * нет, а CDP-домен WebAuthn закрыт. Значит проверяем ровно то, что можно, -
 * и это не мелочь: если хранилище сломается, экран входа покажет кнопку,
 * которая всегда отказывает, и PIN придётся вспоминать в панике.
 *
 * localStorage подменяется: модуль читает его в момент вызова, а не при
 * загрузке, поэтому заглушки достаточно.
 */
import type { Account } from '../src/lib/accounts.ts'

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const { hasBiometrics, forgetBiometrics } = await import('../src/lib/biometrics.ts')

let failed = 0
function check(ok: boolean, name: string, detail: string): void {
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ '} ${name}\n         ${detail}`)
}

const KEY = 'love-promises-biometrics'
const bikosh = { id: 'bikosh', nickname: 'Бикош', email: 'a@b.c' } as Account
const aminosh = { id: 'aminosh', nickname: 'Аминош', email: 'x@y.z' } as Account

check(!hasBiometrics(bikosh), 'Пустое хранилище - ключа нет', 'вход только по PIN')

store.set(KEY, '{ это не json')
check(
  !hasBiometrics(bikosh),
  'Испорченное хранилище не роняет экран входа',
  'иначе войти было бы нельзя вообще - ни лицом, ни PIN',
)

store.set(KEY, JSON.stringify({ [bikosh.email]: { credentialId: 'AAAA', pin: '010904' } }))
check(hasBiometrics(bikosh), 'Заведённый ключ виден', 'кнопка появится')
check(!hasBiometrics(aminosh), 'Чужой ключ не считается своим', 'ключи по аккаунтам раздельные')

forgetBiometrics(bikosh)
check(!hasBiometrics(bikosh), 'Выключение стирает ключ', 'вместе с запомненным PIN')

store.set(
  KEY,
  JSON.stringify({
    [bikosh.email]: { credentialId: 'AAAA', pin: '010904' },
    [aminosh.email]: { credentialId: 'BBBB', pin: '290604' },
  }),
)
forgetBiometrics(bikosh)
check(
  !hasBiometrics(bikosh) && hasBiometrics(aminosh),
  'Выключение у одного не трогает второго',
  'на телефоне два аккаунта',
)

check(
  !JSON.parse(store.get(KEY) ?? '{}')[bikosh.email],
  'После выключения PIN в хранилище не остаётся',
  'выключил - значит стёрли, а не просто спрятали кнопку',
)

console.log(failed === 0 ? '\nХранилище ключей верно.' : `\nПровалено: ${failed}`)
if (failed > 0) process.exit(1)
