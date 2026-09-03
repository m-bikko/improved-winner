import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { foodFromRow, servingFromRow, type Food, type Serving } from './types'

/**
 * Вся база продуктов тянется одним запросом и живёт в кэше.
 *
 * Это осознанно: продуктов сотни, а не сотни тысяч, и взамен поиск работает
 * мгновенно и офлайн, без запроса на каждую введённую букву.
 */
export function useFoods() {
  return useQuery({
    queryKey: ['foods'],
    queryFn: async (): Promise<Food[]> => {
      const { data, error } = await supabase
        .from('foods_v')
        .select('*')
        .is('archived_at', null)
        .order('name')
      if (error) throw error
      return data.map(foodFromRow)
    },
  })
}

/**
 * Меры плоским списком.
 *
 * Именно списком, а не Map: кэш TanStack Query сериализуется в JSON при
 * сохранении в IndexedDB, и Map после восстановления превращается в пустой
 * объект без метода get. Всё, что попадает в кэш, обязано переживать
 * JSON.stringify → JSON.parse.
 */
export function useServings() {
  return useQuery({
    queryKey: ['servings'],
    queryFn: async (): Promise<Serving[]> => {
      const { data, error } = await supabase.from('food_servings').select('*').order('sort_order')
      if (error) throw error
      return data.map(servingFromRow)
    },
  })
}

/** Тот же запрос, но сгруппированный по продукту. Map строится в памяти. */
export function useServingsByFood() {
  const query = useServings()
  const byFood = useMemo(() => {
    const map = new Map<string, Serving[]>()
    // Данные пришли из IndexedDB, где могла остаться форма от прошлой версии.
    // CACHE_BUSTER такое отсекает, но падать всем приложением из-за кэша
    // не стоит в любом случае.
    if (!Array.isArray(query.data)) return map
    for (const serving of query.data) {
      const list = map.get(serving.foodId)
      if (list) list.push(serving)
      else map.set(serving.foodId, [serving])
    }
    return map
  }, [query.data])

  return { ...query, byFood }
}

export type DishItem = { id: string; foodId: string; grams: number }

export function useDishItems(dishId: string | undefined) {
  return useQuery({
    queryKey: ['dish-items', dishId],
    queryFn: async (): Promise<DishItem[]> => {
      const { data, error } = await supabase
        .from('dish_items')
        .select('id, food_id, grams')
        .eq('dish_id', dishId ?? '')
        .order('sort_order')
      if (error) throw error
      return data.map((r) => ({ id: r.id, foodId: r.food_id, grams: r.grams }))
    },
    enabled: dishId !== undefined,
  })
}

export type DishDraft = {
  name: string
  brand: string | null
  yieldGrams: number | null
  items: { foodId: string; grams: number }[]
}

/**
 * Сохранение блюда.
 *
 * КБЖУ блюда здесь не пишется вовсе — его считает вью foods_v из состава.
 * Поэтому и нет риска, что сохранённые цифры разойдутся с ингредиентами.
 *
 * Состав переписывается целиком: ингредиентов единицы, а разбор diff'а
 * ничего бы не дал, кроме сложности.
 */
export function useSaveDish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: DishDraft }): Promise<string> => {
      const payload = {
        kind: 'dish' as const,
        name: draft.name.trim(),
        brand: draft.brand?.trim() || null,
        yield_grams: draft.yieldGrams,
      }

      let dishId: string
      if (id) {
        const { error } = await supabase.from('foods').update(payload).eq('id', id)
        if (error) throw error
        dishId = id
      } else {
        const { data, error } = await supabase.from('foods').insert(payload).select('id').single()
        if (error) throw error
        dishId = data.id
      }

      const { error: clearError } = await supabase.from('dish_items').delete().eq('dish_id', dishId)
      if (clearError) throw clearError

      const rows = draft.items
        .filter((i) => i.foodId && i.grams > 0)
        .map((i, index) => ({
          dish_id: dishId,
          food_id: i.foodId,
          grams: i.grams,
          sort_order: index,
        }))

      if (rows.length > 0) {
        const { error } = await supabase.from('dish_items').insert(rows)
        if (error) throw error
      }
      return dishId
    },
    onSuccess: (dishId) => {
      void qc.invalidateQueries({ queryKey: ['foods'] })
      void qc.invalidateQueries({ queryKey: ['dish-items', dishId] })
    },
  })
}

export type FoodDraft = {
  name: string
  brand: string | null
  kcal100: number
  protein100: number
  fat100: number
  carbs100: number
}

export function useSaveFood() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: FoodDraft }): Promise<string> => {
      const payload = {
        kind: 'product' as const,
        name: draft.name.trim(),
        brand: draft.brand?.trim() || null,
        kcal_100: draft.kcal100,
        protein_100: draft.protein100,
        fat_100: draft.fat100,
        carbs_100: draft.carbs100,
      }

      if (id) {
        const { error } = await supabase.from('foods').update(payload).eq('id', id)
        if (error) throw error
        return id
      }

      const { data, error } = await supabase.from('foods').insert(payload).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['foods'] }),
  })
}

/**
 * Архивация вместо удаления.
 *
 * Записи в дневнике ссылаются на продукт, и удаление обнулило бы эту связь
 * во всей истории. Плюс продукт может быть ингредиентом блюда — там стоит
 * ON DELETE RESTRICT, и база просто не даст его удалить.
 */
export function useArchiveFood() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('foods')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['foods'] }),
  })
}

export function useSaveServings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      foodId,
      servings,
    }: {
      foodId: string
      servings: { id?: string; label: string; grams: number }[]
    }) => {
      // Полная замена набора мер: их единицы, а разбирать что добавилось,
      // что изменилось и что удалилось — лишняя сложность на ровном месте
      const { error: deleteError } = await supabase
        .from('food_servings')
        .delete()
        .eq('food_id', foodId)
      if (deleteError) throw deleteError

      const rows = servings
        .filter((s) => s.label.trim() && s.grams > 0)
        .map((s, i) => ({
          food_id: foodId,
          label: s.label.trim(),
          grams: s.grams,
          sort_order: i,
        }))

      if (rows.length > 0) {
        const { error } = await supabase.from('food_servings').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['servings'] }),
  })
}
