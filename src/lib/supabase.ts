import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'
import { env } from './env'
import { isCookMode } from './mode'

/**
 * Единственный экземпляр клиента на всё приложение.
 *
 * Синглтон здесь принципиален: несколько клиентов в одной вкладке (или несколько
 * открытых копий PWA) дерутся за ротацию refresh-токена - у Supabase окно повторного
 * использования около 10 секунд, и проигравший получает разлогин на пустом месте.
 *
 * `detectSessionInUrl: false` - вход только по PIN, magic-link и OAuth-редиректов нет,
 * так что парсить хеш при каждой загрузке незачем.
 *
 * У повара своя сессия под своим ключом: его ссылка, открытая на телефоне
 * пары, не должна выкидывать владельца из аккаунта.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: isCookMode ? 'love-promises-cook-auth' : 'love-promises-auth',
  },
})
