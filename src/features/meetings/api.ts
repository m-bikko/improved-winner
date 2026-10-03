import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'
import type { Meeting, MeetingItem } from './logic'

const KEY = ['meetings'] as const

function explain(error: { message: string }): Error {
  if (error.message.includes('meetings_no_overlap')) return new Error(tr('mt.overlap'))
  if (error.message.includes('meetings_dates')) return new Error(tr('mt.badDates'))
  return new Error(error.message)
}

/** Встречи с планом - одним запросом: встреч единицы, пунктов десятки. */
export function useMeetings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Meeting[]> => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*, meeting_items(*)')
        .order('starts_on', { ascending: false })
      if (error) throw error
      return data.map((m) => ({
        id: m.id,
        startsOn: m.starts_on,
        endsOn: m.ends_on,
        place: m.place,
        note: m.note,
        memoryId: m.memory_id,
        createdBy: m.created_by,
        items: m.meeting_items
          .map((i) => ({
            id: i.id,
            title: i.title,
            done: i.done,
            source: (i.source === 'wish' || i.source === 'watch' || i.source === 'idea' ? i.source : null) as MeetingItem['source'],
            createdAt: i.created_at,
          }))
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
      }))
    },
  })
}

function useDone() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

export function useSaveMeeting() {
  const done = useDone()
  return useMutation({
    mutationFn: async (input: { id?: string; startsOn: string; endsOn: string; place: string; note: string }) => {
      const row = {
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        place: input.place.trim() || null,
        note: input.note.trim() || null,
      }
      const { error } = input.id
        ? await supabase.from('meetings').update(row).eq('id', input.id)
        : await supabase.from('meetings').insert(row)
      if (error) throw explain(error)
    },
    onSettled: done,
  })
}

export function useDeleteMeeting() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useAddItem() {
  const done = useDone()
  return useMutation({
    mutationFn: async (input: { meetingId: string; title: string; source: MeetingItem['source'] }) => {
      const { error } = await supabase
        .from('meeting_items')
        .insert({ meeting_id: input.meetingId, title: input.title.trim(), source: input.source })
      if (error) throw error
    },
    onSettled: done,
  })
}

/** Галочка в плане - оптимистично, как отметки в челленджах. */
export function useToggleItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('meeting_items').update({ done }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: KEY })
      const before = qc.getQueryData<Meeting[]>(KEY)
      qc.setQueryData<Meeting[]>(KEY, (list) =>
        list?.map((m) => ({ ...m, items: m.items.map((i) => (i.id === id ? { ...i, done } : i)) })),
      )
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteItem() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meeting_items').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

/**
 * Встреча - в ленту воспоминаний: запись с датой начала, местом и тем,
 * что из плана успели. Фото добавляются уже в ленте.
 */
export function useMeetingToMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ meeting, caption }: { meeting: Meeting; caption: string }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase
        .from('memories')
        .insert({ id, happened_on: meeting.startsOn, caption, place: meeting.place })
      if (error) throw error
      const linked = await supabase.from('meetings').update({ memory_id: id }).eq('id', meeting.id)
      if (linked.error) throw linked.error
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['memories'] })
    },
  })
}
