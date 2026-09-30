import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enqueue, flushOutbox, isRetriable } from '@/lib/outbox'
import type { GoalDirection, Macros } from '@/lib/nutrition'
import type { Food } from '@/features/foods/types'
import { entryFromRow, type DiaryEntry, type Meal } from './types'

/** Записи за день. Оба видят дневники друг друга - RLS это разрешает. */
export function useDiaryDay(date: string, userId: string) {
  return useQuery({
    queryKey: ['diary', userId, date],
    queryFn: async (): Promise<DiaryEntry[]> => {
      const { data, error } = await supabase
        .from('diary_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data.map(entryFromRow)
    },
    // Пустой userId означает «не за кем следить»: так режим сравнения не шлёт
    // запрос, пока партнёр не выбран
    enabled: userId !== '',
  })
}

/** Итог дня: съедено и норма из снимка дня (null, если снимка нет). */
export type DaySummary = {
  kcal: number
  protein: number
  goalKcal: number | null
  goalProtein: number | null
}

/**
 * Итоги по дням за диапазон - для календаря месяца и ленты недели.
 *
 * Ключ начинается с 'diary', чтобы правка и удаление записи, которые
 * сбрасывают весь дневник, сбрасывали и итоги: иначе кольцо дня в ленте
 * показывало бы старую сумму.
 *
 * Обычный объект, а не Map: кэш сериализуется в IndexedDB, и Map после
 * восстановления превращается в {} без методов. Здесь это уже ломалось.
 */
export function useDiarySummaries(userId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['diary', userId, 'summary', from, to],
    queryFn: async (): Promise<Record<string, DaySummary>> => {
      const { data, error } = await supabase.rpc('diary_month', {
        p_user: userId,
        p_from: from,
        p_to: to,
      })
      if (error) throw error

      const byDay: Record<string, DaySummary> = {}
      for (const row of data ?? []) {
        // PostgREST отдаёт date строкой YYYY-MM-DD; обрезаем на случай,
        // если когда-нибудь приедет с временем
        byDay[String(row.day).slice(0, 10)] = {
          kcal: Number(row.kcal ?? 0),
          protein: Number(row.protein ?? 0),
          goalKcal: row.goal_kcal === null ? null : Number(row.goal_kcal),
          goalProtein: row.goal_protein === null ? null : Number(row.goal_protein),
        }
      }
      return byDay
    },
    enabled: userId !== '',
  })
}

/** Что человек ел за последние недели - для списков «Недавние» и «Часто». */
export function useRecentFoodIds(userId: string) {
  return useQuery({
    queryKey: ['diary-recent', userId],
    queryFn: async (): Promise<{ foodId: string; count: number; lastAt: string }[]> => {
      const { data, error } = await supabase
        .from('diary_entries')
        .select('food_id, created_at')
        .eq('user_id', userId)
        .not('food_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error

      const stats = new Map<string, { count: number; lastAt: string }>()
      for (const row of data) {
        if (!row.food_id) continue
        const prev = stats.get(row.food_id)
        if (prev) prev.count += 1
        else stats.set(row.food_id, { count: 1, lastAt: row.created_at })
      }
      return [...stats].map(([foodId, s]) => ({ foodId, ...s }))
    },
    enabled: userId !== '',
    staleTime: 5 * 60_000,
  })
}

/**
 * Норма дня.
 *
 * Сегодня считается живьём из текущего профиля, прошлые дни читаются из снимка.
 * Без этого сброшенный вес переписывал бы историю: норма падает с 2635 до 2400,
 * и день, закрытый на 95%, задним числом становится перебором.
 *
 * Если снимка на прошлый день нет (день прожит до появления таблицы или в нём
 * ничего не записано), берём текущую норму - другой информации всё равно нет.
 */
export function useDayGoal(userId: string, date: string) {
  return useQuery({
    queryKey: ['daily-goal', userId, date],
    queryFn: async (): Promise<{ goal: Macros; goalDirection: GoalDirection } | null> => {
      const { data, error } = await supabase
        .from('daily_goals')
        .select('kcal, protein, fat, carbs, goal_direction')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        goal: { kcal: data.kcal, protein: data.protein, fat: data.fat, carbs: data.carbs },
        goalDirection: data.goal_direction as GoalDirection,
      }
    },
    enabled: userId !== '',
  })
}

/**
 * Замораживает норму дня.
 *
 * Перезаписывать снимок можно только у сегодняшнего дня: пока день идёт,
 * норма отражает текущий профиль. Прошлый день трогать нельзя - в этом весь
 * смысл снимка.
 */
export function useFreezeDayGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      userId: string
      date: string
      goal: Macros
      goalDirection: GoalDirection
    }) => {
      const { error } = await supabase.from('daily_goals').upsert(
        {
          user_id: input.userId,
          date: input.date,
          kcal: input.goal.kcal,
          protein: input.goal.protein,
          fat: input.goal.fat,
          carbs: input.goal.carbs,
          goal_direction: input.goalDirection,
        },
        { onConflict: 'user_id,date' },
      )
      if (error) throw error
    },
    onSuccess: (_r, input) =>
      void qc.invalidateQueries({ queryKey: ['daily-goal', input.userId, input.date] }),
  })
}

export type AddEntryInput = {
  userId: string
  date: string
  meal: Meal
  food: Food
  grams: number
  servingLabel: string | null
}

/**
 * Собирает снимок КБЖУ на момент добавления.
 *
 * Снимок хранится НА 100 Г, а не абсолютом за порцию: только так можно потом
 * честно поправить граммовку, не сходив в живой продукт - а он к тому времени
 * мог измениться, и история поехала бы ровно там, где мы её защищали.
 */
function toRow(input: AddEntryInput, id: string) {
  return {
    id,
    user_id: input.userId,
    date: input.date,
    meal: input.meal,
    food_id: input.food.id,
    grams: input.grams,
    name_snapshot: input.food.name,
    brand_snapshot: input.food.brand,
    serving_label_snapshot: input.servingLabel,
    kcal_100: input.food.kcal100,
    protein_100: input.food.protein100,
    fat_100: input.food.fat100,
    carbs_100: input.food.carbs100,
  }
}

export function useAddEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddEntryInput) => {
      // id генерирует клиент: без него офлайн-очередь не смогла бы повторить
      // отправку идемпотентно
      const row = toRow(input, crypto.randomUUID())
      const { error } = await supabase.from('diary_entries').insert(row)

      if (error) {
        // Сетевую ошибку кладём в очередь и считаем успехом: запись у человека
        // «есть», уйдёт при первой же связи. Отказ политики или битые данные
        // очередь не спасёт - такое показываем сразу
        if (!isRetriable(error)) throw error
        enqueue({ table: 'diary_entries', onConflict: 'id', row, key: row.id })
      }
      return row.id
    },
    onSuccess: (_id, input) => {
      void qc.invalidateQueries({ queryKey: ['diary', input.userId, input.date] })
      void qc.invalidateQueries({ queryKey: ['diary', input.userId, 'summary'] })
      void qc.invalidateQueries({ queryKey: ['diary-recent', input.userId] })
    },
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      grams: number
      meal: Meal
      servingLabel: string | null
    }) => {
      const { error } = await supabase
        .from('diary_entries')
        .update({
          grams: input.grams,
          meal: input.meal,
          serving_label_snapshot: input.servingLabel,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['diary'] }),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('diary_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['diary'] }),
  })
}

/**
 * Сохраняет новый порядок и приёмы пищи после перетаскивания.
 *
 * Одним вызовом на все затронутые строки: серия отдельных запросов оставила бы
 * дневник в промежуточном состоянии, если часть дойдёт, а часть нет.
 *
 * Инвалидацию делаем только при ошибке. При успехе список уже показывает нужный
 * порядок - обновлять его повторно значит моргнуть на ровном месте.
 */
export function useReorderEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: { id: string; meal: Meal; sortOrder: number }[]) => {
      if (items.length === 0) return
      const { error } = await supabase.rpc('reorder_diary', {
        p_items: items.map((i) => ({ id: i.id, meal: i.meal, sort_order: i.sortOrder })),
      })
      if (error) throw error
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['diary'] }),
  })
}

/** Перенос записей другого дня в текущий - «скопировать вчера». */
export function useCopyEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { entries: DiaryEntry[]; toDate: string; userId: string }) => {
      const rows = input.entries.map((e) => ({
        id: crypto.randomUUID(),
        user_id: input.userId,
        date: input.toDate,
        meal: e.meal,
        food_id: e.foodId,
        grams: e.grams,
        name_snapshot: e.name,
        brand_snapshot: e.brand,
        serving_label_snapshot: e.servingLabel,
        kcal_100: e.kcal100,
        protein_100: e.protein100,
        fat_100: e.fat100,
        carbs_100: e.carbs100,
      }))
      if (rows.length === 0) return 0
      const { error } = await supabase.from('diary_entries').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['diary'] }),
  })
}

/** Досылает очередь при появлении сети и при запуске. */
export function useOutboxFlush(): void {
  const qc = useQueryClient()
  useEffect(() => {
    const flush = () => {
      void flushOutbox().then((sent) => {
        if (sent === 0) return
        // Очередь общая, и что именно ушло, здесь уже неизвестно -
        // обновляем всё, чего она касается
        void qc.invalidateQueries({ queryKey: ['diary'] })
        void qc.invalidateQueries({ queryKey: ['checkins'] })
        void qc.invalidateQueries({ queryKey: ['weight'] })
      })
    }
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [qc])
}
