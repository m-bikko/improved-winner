import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tr } from '@/lib/i18n'
import type { Database } from '@/types/db'
import { isPlaceKind, type Place, type PlaceKind, type Point } from './logic'

const KEY = ['places'] as const

type Row = Database['public']['Tables']['places']['Row']

function fromRow(r: Row): Place {
  return {
    id: r.id,
    name: r.name,
    kind: isPlaceKind(r.kind) ? r.kind : 'other',
    note: r.note,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    visitedOn: r.visited_on,
    memoryId: r.memory_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

function explain(error: { message: string }): Error {
  if (error.message.includes('places_same_point')) return new Error(tr('places.duplicate'))
  return new Error(error.message)
}

export function usePlaces() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Place[]> => {
      const { data, error } = await supabase.from('places').select('*').order('created_at', { ascending: false })
      if (error) throw explain(error)
      return data.map(fromRow)
    },
  })
}

function useDone() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

/** Новое место: возвращает id, чтобы экран сразу показал его на карте. */
export function useAddPlace() {
  const done = useDone()
  return useMutation({
    mutationFn: async (input: Point & { name: string; kind: PlaceKind; note: string; address: string | null }): Promise<string> => {
      const { data, error } = await supabase
        .from('places')
        .insert({
          name: input.name.trim(),
          kind: input.kind,
          note: input.note.trim() || null,
          address: input.address,
          lat: input.lat,
          lng: input.lng,
        })
        .select('id')
        .single()
      if (error) throw explain(error)
      return data.id
    },
    onSuccess: done,
  })
}

export function useEditPlace() {
  const done = useDone()
  return useMutation({
    mutationFn: async (input: { id: string; name: string; kind: PlaceKind; note: string }) => {
      const { error } = await supabase
        .from('places')
        .update({ name: input.name.trim(), kind: input.kind, note: input.note.trim() || null })
        .eq('id', input.id)
      if (error) throw explain(error)
    },
    onSuccess: done,
  })
}

/** Точка переехала - вместе с ней адрес: прежний относился к старому месту. */
export function useMovePlace() {
  const done = useDone()
  return useMutation({
    mutationFn: async (input: Point & { id: string; address: string | null }) => {
      const { error } = await supabase
        .from('places')
        .update({ lat: input.lat, lng: input.lng, address: input.address })
        .eq('id', input.id)
      if (error) throw explain(error)
    },
    onSuccess: done,
  })
}

export function useDeletePlace() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('places').delete().eq('id', id)
      if (error) throw explain(error)
    },
    onSuccess: done,
  })
}

/**
 * Побывали: отметка и, по желанию, воспоминание с названием места.
 * Воспоминание - сначала: отметка ссылается на него.
 */
export function useMarkVisited() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, day, caption }: { id: string; day: string; caption: string | null }) => {
      let memoryId: string | null = null
      if (caption) {
        memoryId = crypto.randomUUID()
        const mem = await supabase.from('memories').insert({ id: memoryId, happened_on: day, caption })
        if (mem.error) throw explain(mem.error)
      }
      const { error } = await supabase.from('places').update({ visited_on: day, memory_id: memoryId }).eq('id', id)
      if (error) throw explain(error)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['memories'] })
    },
  })
}

/** Снять отметку. Записанное воспоминание остаётся: оно уже отдельная вещь. */
export function useUnmarkVisited() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('places').update({ visited_on: null, memory_id: null }).eq('id', id)
      if (error) throw explain(error)
    },
    onSuccess: done,
  })
}
