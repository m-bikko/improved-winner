import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const KEY = ['health'] as const

export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const

export type HealthCard = {
  userId: string
  bloodType: string | null
  allergies: string | null
  conditions: string | null
  emergency: string | null
  notes: string | null
}

export type Medication = {
  id: string
  userId: string
  name: string
  dose: string | null
  times: string[]
  startsOn: string
  endsOn: string | null
  note: string | null
}

export type Doctor = {
  id: string
  personId: string | null
  name: string
  specialty: string | null
  phone: string | null
  place: string | null
  note: string | null
}

export type Health = {
  cards: HealthCard[]
  meds: Medication[]
  /** Принятое: `medId|day|slot`. Строки, а не Set - кэш переживает JSON. */
  doses: string[]
  doctors: Doctor[]
}

export const doseKey = (medId: string, day: string, slot: string): string => `${medId}|${day}|${slot}`

/** Весь раздел одним ключом: карточки, лекарства, приёмы за две недели, врачи. */
export function useHealth(since: string) {
  return useQuery({
    queryKey: [...KEY, since],
    queryFn: async (): Promise<Health> => {
      const [cards, meds, doses, doctors] = await Promise.all([
        supabase.from('health_cards').select('*'),
        supabase.from('medications').select('*').order('created_at'),
        supabase.from('med_doses').select('medication_id, day, slot').gte('day', since),
        supabase.from('doctors').select('*').order('name'),
      ])
      if (cards.error) throw cards.error
      if (meds.error) throw meds.error
      if (doses.error) throw doses.error
      if (doctors.error) throw doctors.error
      return {
        cards: cards.data.map((c) => ({
          userId: c.user_id,
          bloodType: c.blood_type,
          allergies: c.allergies,
          conditions: c.conditions,
          emergency: c.emergency,
          notes: c.notes,
        })),
        meds: meds.data.map((m) => ({
          id: m.id,
          userId: m.user_id,
          name: m.name,
          dose: m.dose,
          times: m.times,
          startsOn: m.starts_on,
          endsOn: m.ends_on,
          note: m.note,
        })),
        doses: doses.data.map((d) => doseKey(d.medication_id, d.day, d.slot)),
        doctors: doctors.data.map((d) => ({
          id: d.id,
          personId: d.person_id,
          name: d.name,
          specialty: d.specialty,
          phone: d.phone,
          place: d.place,
          note: d.note,
        })),
      }
    },
  })
}

function useDone() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: KEY })
}

const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim())

export function useSaveCard() {
  const done = useDone()
  return useMutation({
    mutationFn: async (c: { userId: string; bloodType: string | null; allergies: string; conditions: string; emergency: string; notes: string }) => {
      const { error } = await supabase.from('health_cards').upsert(
        {
          user_id: c.userId,
          blood_type: c.bloodType,
          allergies: orNull(c.allergies),
          conditions: orNull(c.conditions),
          emergency: orNull(c.emergency),
          notes: orNull(c.notes),
        },
        { onConflict: 'user_id' },
      )
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useSaveMed() {
  const done = useDone()
  return useMutation({
    mutationFn: async (m: { id?: string; name: string; dose: string; times: string[]; startsOn: string; endsOn: string; note: string }) => {
      const row = {
        name: m.name.trim(),
        dose: orNull(m.dose),
        times: [...new Set(m.times)].sort(),
        starts_on: m.startsOn,
        ends_on: m.endsOn === '' ? null : m.endsOn,
        note: orNull(m.note),
      }
      const { error } = m.id
        ? await supabase.from('medications').update(row).eq('id', m.id)
        : await supabase.from('medications').insert(row)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useDeleteMed() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('medications').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

/** Приём - оптимистично: галочка ставится сразу. */
export function useToggleDose(since: string) {
  const qc = useQueryClient()
  const key = [...KEY, since]
  return useMutation({
    mutationFn: async ({ medId, day, slot, taken }: { medId: string; day: string; slot: string; taken: boolean }) => {
      const { error } = taken
        ? await supabase.from('med_doses').insert({ medication_id: medId, day, slot })
        : await supabase.from('med_doses').delete().eq('medication_id', medId).eq('day', day).eq('slot', slot)
      if (error) throw error
    },
    onMutate: async ({ medId, day, slot, taken }) => {
      await qc.cancelQueries({ queryKey: key })
      const before = qc.getQueryData<Health>(key)
      const k = doseKey(medId, day, slot)
      qc.setQueryData<Health>(key, (h) =>
        h ? { ...h, doses: taken ? [...h.doses.filter((x) => x !== k), k] : h.doses.filter((x) => x !== k) } : h,
      )
      return { before }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSaveDoctor() {
  const done = useDone()
  return useMutation({
    mutationFn: async (d: { id?: string; personId: string | null; name: string; specialty: string; phone: string; place: string; note: string }) => {
      const row = {
        person_id: d.personId,
        name: d.name.trim(),
        specialty: orNull(d.specialty),
        phone: orNull(d.phone),
        place: orNull(d.place),
        note: orNull(d.note),
      }
      const { error } = d.id ? await supabase.from('doctors').update(row).eq('id', d.id) : await supabase.from('doctors').insert(row)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useDeleteDoctor() {
  const done = useDone()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doctors').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

/** Лекарство идёт в этот день (в сроках курса). */
export function activeOn(m: Medication, day: string): boolean {
  return m.startsOn <= day && (m.endsOn === null || m.endsOn >= day)
}
