import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'
import type { WatchItem, WatchKind, WatchStatus } from './logic'

const KEY = ['watch'] as const

function explain(error: { message: string }): Error {
  if (error.message.includes('watch_ratings_watched_only')) return new Error(tr('w.rateWatchedOnly'))
  if (error.message.includes('watch_items_rated_stays_watched')) return new Error(tr('w.ratedStays'))
  return new Error(error.message)
}

/**
 * Список, «хочу» и оценки - три запроса параллельно и один ключ кэша.
 *
 * Оценки отдельно, а не вложенным select: на них своя политика (оценка
 * второго видна после своей), и вложенная выборка тихо вернула бы пустой
 * массив там, где оценка есть, но ещё закрыта. Кто оценил - отдельная
 * функция без самих оценок.
 */
export function useWatch() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<WatchItem[]> => {
      const [items, ratings, progress] = await Promise.all([
        supabase.from('watch_items').select('*, watch_wants(user_id)').order('created_at', { ascending: false }),
        supabase.from('watch_ratings').select('*'),
        supabase.rpc('watch_rating_progress'),
      ])
      if (items.error) throw items.error
      if (ratings.error) throw ratings.error
      if (progress.error) throw progress.error
      return items.data.map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind as WatchKind,
        year: r.year,
        note: r.note,
        status: r.status as WatchStatus,
        watchedOn: r.watched_on,
        addedBy: r.added_by,
        createdAt: r.created_at,
        wants: r.watch_wants.map((w) => w.user_id),
        ratings: ratings.data
          .filter((x) => x.item_id === r.id)
          .map((x) => ({ userId: x.user_id, stars: x.stars, comment: x.comment })),
        ratedBy: (progress.data ?? []).filter((p) => p.item_id === r.id).map((p) => p.user_id),
      }))
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

/**
 * Новый фильм - и сразу «хочу» от того, кто добавил: добавить в общий список
 * то, чего сам не хочешь, - странный случай, а отмечать вторым нажатием
 * своё же желание никто не станет.
 */
export function useSaveItem() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      userId: string
      title: string
      kind: WatchKind
      year: number | null
      note: string | null
    }) => {
      const row = {
        title: input.title.trim(),
        kind: input.kind,
        year: input.year,
        note: input.note?.trim() || null,
      }
      if (input.id) {
        const { error } = await supabase.from('watch_items').update(row).eq('id', input.id)
        if (error) throw explain(error)
        return
      }
      const { data, error } = await supabase.from('watch_items').insert(row).select('id').single()
      if (error) throw explain(error)
      const { error: wantError } = await supabase
        .from('watch_wants')
        .insert({ item_id: data.id, user_id: input.userId })
      if (wantError) throw explain(wantError)
    },
    onSettled: done,
  })
}

export function useDeleteItem() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('watch_items').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

/** «Хочу» - оптимистично: сердце закрашивается сразу. */
export function useToggleWant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, userId, on }: { itemId: string; userId: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from('watch_wants').insert({ item_id: itemId, user_id: userId })
        : await supabase.from('watch_wants').delete().eq('item_id', itemId).eq('user_id', userId)
      if (error) throw error
    },
    onMutate: async ({ itemId, userId, on }) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<WatchItem[]>(KEY)
      qc.setQueryData<WatchItem[]>(KEY, (list) =>
        list?.map((i) =>
          i.id !== itemId
            ? i
            : { ...i, wants: on ? [...i.wants.filter((w) => w !== userId), userId] : i.wants.filter((w) => w !== userId) },
        ),
      )
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSetStatus() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, status, watchedOn }: { id: string; status: WatchStatus; watchedOn: string | null }) => {
      const { error } = await supabase
        .from('watch_items')
        .update({ status, watched_on: status === 'watched' ? watchedOn : null })
        .eq('id', id)
      if (error) throw explain(error)
    },
    onSettled: done,
  })
}

export function useRate() {
  const done = useInvalidate()
  return useMutation({
    mutationFn: async (input: { itemId: string; userId: string; stars: number; comment: string | null }) => {
      const { error } = await supabase.from('watch_ratings').upsert(
        {
          item_id: input.itemId,
          user_id: input.userId,
          stars: input.stars,
          comment: input.comment?.trim() || null,
        },
        { onConflict: 'item_id,user_id' },
      )
      if (error) throw explain(error)
    },
    onSettled: done,
  })
}
