import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

/**
 * Кэш данных живёт здесь, а не в Service Worker.
 *
 * Соблазн повесить NetworkFirst на домен Supabase велик, но это плохая идея:
 * Workbox не кэширует POST (а PostgREST-фильтры уходят именно POST'ом),
 * зато исправно отдаёт протухшие ответы и маскирует 401, из-за чего разлогин
 * выглядит как «приложение показывает старые данные». Service Worker занимается
 * только оболочкой; данные — вот этим персистером.
 *
 * Хранилище — IndexedDB, а не localStorage: база продуктов на пару сотен
 * килобайт, а localStorage синхронный и блокирует главный поток на каждом
 * чтении и записи.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные меняют два человека с одного-двух устройств. Гонок почти нет,
      // поэтому минута свежести экономит запросы без риска показать старое.
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: (failureCount, error) => {
        // Нет смысла ретраить отказ политики или битый запрос
        const status = (error as { status?: number } | null)?.status
        if (status !== undefined && status >= 400 && status < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
})

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'love-promises-query-cache',
  throttleTime: 1000,
})

/**
 * Версия кэша. Меняется, когда форма данных в кэше несовместима с новой сборкой:
 * так persistQueryClient выбросит старое вместо того, чтобы отдать компоненту
 * объект неожиданной формы.
 *
 * v2: useServings отдавал Map, а он не переживает JSON-сериализацию в IndexedDB
 * и восстанавливался пустым объектом. Теперь список, но кэш от v1 надо выбросить.
 */
export const CACHE_BUSTER = 'v2'
