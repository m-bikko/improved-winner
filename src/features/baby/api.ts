import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const KEY = ['baby'] as const

export type Baby = {
  id: string
  name: string | null
  sex: 'm' | 'f' | null
  bornOn: string
  weightG: number | null
  heightCm: number | null
}

export type BabyEvent = {
  id: string
  babyId: string
  kind: 'feed' | 'sleep' | 'diaper'
  startedAt: string
  endedAt: string | null
  side: 'left' | 'right' | 'bottle' | null
  amountMl: number | null
  diaper: 'wet' | 'dirty' | 'mixed' | null
  createdBy: string
}

export type Growth = { id: string; date: string; weightG: number | null; heightCm: number | null; headCm: number | null }
export type Checkup = { id: string; date: string; kind: 'vaccine' | 'doctor'; title: string; note: string | null; done: boolean }

export type BabyData = { babies: Baby[]; events: BabyEvent[]; growth: Growth[]; checkups: Checkup[] }

/**
 * Малыш, события за трое суток, рост и визиты - одним ключом. Пока идёт
 * кормление или сон, перечитывается раз в 20 секунд: таймер, начатый
 * на одном телефоне, должен остановиться и на втором.
 */
export function useBaby(since: string, enabled = true) {
  return useQuery({
    queryKey: [...KEY, since],
    enabled,
    queryFn: async (): Promise<BabyData> => {
      const [babies, events, growth, checkups] = await Promise.all([
        supabase.from('babies').select('*').order('born_on', { ascending: false }),
        supabase.from('baby_events').select('*').gte('started_at', since).order('started_at', { ascending: false }),
        supabase.from('baby_growth').select('*').order('date'),
        supabase.from('baby_checkups').select('*').order('date'),
      ])
      if (babies.error) throw babies.error
      if (events.error) throw events.error
      if (growth.error) throw growth.error
      if (checkups.error) throw checkups.error
      return {
        babies: babies.data.map((b) => ({
          id: b.id,
          name: b.name,
          sex: b.sex as Baby['sex'],
          bornOn: b.born_on,
          weightG: b.weight_g,
          heightCm: b.height_cm === null ? null : Number(b.height_cm),
        })),
        events: events.data.map((e) => ({
          id: e.id,
          babyId: e.baby_id,
          kind: e.kind as BabyEvent['kind'],
          startedAt: e.started_at,
          endedAt: e.ended_at,
          side: e.side as BabyEvent['side'],
          amountMl: e.amount_ml,
          diaper: e.diaper as BabyEvent['diaper'],
          createdBy: e.created_by,
        })),
        growth: growth.data.map((g) => ({
          id: g.id,
          date: g.date,
          weightG: g.weight_g,
          heightCm: g.height_cm === null ? null : Number(g.height_cm),
          headCm: g.head_cm === null ? null : Number(g.head_cm),
        })),
        checkups: checkups.data.map((c) => ({
          id: c.id,
          date: c.date,
          kind: c.kind as Checkup['kind'],
          title: c.title,
          note: c.note,
          done: c.done,
        })),
      }
    },
    refetchInterval: (q) => ((q.state.data?.events ?? []).some((e) => e.endedAt === null && e.kind !== 'diaper') ? 20_000 : false),
  })
}

/**
 * Есть ли малыш - для плитки в «Ещё» и на главной; лёгкий запрос.
 * Минута, как у остального: второй должен узнать о рождении из приложения.
 */
export function useHasBaby() {
  return useQuery({
    queryKey: [...KEY, 'exists'],
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase.from('babies').select('id', { count: 'exact', head: true })
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

function useDone() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: KEY })
    void qc.invalidateQueries({ queryKey: ['pregnancy'] })
    void qc.invalidateQueries({ queryKey: ['story'] })
  }
}

/** Малыш родился: беременность база закроет сама. */
export function useAddBaby() {
  const done = useDone()
  return useMutation({
    mutationFn: async (b: { name: string; sex: 'm' | 'f' | null; bornOn: string; weightG: number | ''; heightCm: number | '' }) => {
      const { error } = await supabase.from('babies').insert({
        name: b.name.trim() || null,
        sex: b.sex,
        born_on: b.bornOn,
        weight_g: b.weightG === '' ? null : b.weightG,
        height_cm: b.heightCm === '' ? null : b.heightCm,
      })
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useUpdateBaby() {
  const done = useDone()
  return useMutation({
    mutationFn: async (b: { id: string; name: string; sex: 'm' | 'f' | null }) => {
      const { error } = await supabase.from('babies').update({ name: b.name.trim() || null, sex: b.sex }).eq('id', b.id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useStartEvent() {
  const done = useDone()
  return useMutation({
    mutationFn: async (e: {
      babyId: string
      kind: BabyEvent['kind']
      side?: BabyEvent['side']
      diaper?: BabyEvent['diaper']
      amountMl?: number | null
      startedAt?: string
      endedAt?: string | null
    }) => {
      const { error } = await supabase.from('baby_events').insert({
        baby_id: e.babyId,
        kind: e.kind,
        started_at: e.startedAt ?? new Date().toISOString(),
        ended_at: e.endedAt ?? null,
        side: e.side ?? null,
        diaper: e.diaper ?? null,
        amount_ml: e.amountMl ?? null,
      })
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useStopEvent() {
  const done = useDone()
  return useMutation({
    mutationFn: async ({ id, startedAt, amountMl }: { id: string; startedAt: string; amountMl?: number | null }) => {
      // Часы телефона могут отставать: конец не раньше начала плюс секунда
      const end = new Date(Math.max(Date.now(), new Date(startedAt).getTime() + 1000))
      const { error } = await supabase
        .from('baby_events')
        .update({ ended_at: end.toISOString(), ...(amountMl ? { amount_ml: amountMl } : {}) })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useDeleteEvent() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('baby_events').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useAddGrowth() {
  const done = useDone()
  return useMutation({
    mutationFn: async (g: { babyId: string; date: string; weightG: number | ''; heightCm: number | ''; headCm: number | '' }) => {
      const { error } = await supabase.from('baby_growth').upsert(
        {
          baby_id: g.babyId,
          date: g.date,
          weight_g: g.weightG === '' ? null : g.weightG,
          height_cm: g.heightCm === '' ? null : g.heightCm,
          head_cm: g.headCm === '' ? null : g.headCm,
        },
        { onConflict: 'baby_id,date' },
      )
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useSaveCheckup() {
  const done = useDone()
  return useMutation({
    mutationFn: async (c: { id?: string; babyId: string; date: string; kind: Checkup['kind']; title: string; note: string; done?: boolean }) => {
      const row = { baby_id: c.babyId, date: c.date, kind: c.kind, title: c.title.trim(), note: c.note.trim() || null, done: c.done ?? false }
      const { error } = c.id ? await supabase.from('baby_checkups').update(row).eq('id', c.id) : await supabase.from('baby_checkups').insert(row)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useToggleCheckup() {
  const done = useDone()
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from('baby_checkups').update({ done: value }).eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useDeleteCheckup() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('baby_checkups').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}
