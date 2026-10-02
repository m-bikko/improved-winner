import { useUserId } from '@/auth/AuthProvider'
import { useT } from '@/lib/i18n'
import { personTone } from '@/ui/Avatar'
import type { Tone } from '@/ui/tones'
import { useProfiles, type Profile } from './api'

export type Pair = {
  userId: string
  /** Пусто, пока профили не загрузились или второго нет. */
  partnerId: string
  ids: string[]
  me: Profile | undefined
  partner: Profile | undefined
  myName: string
  partnerName: string
  myTone: Tone
  partnerTone: Tone
  /** Имя по id - для подписей «кто сделал». */
  nameOf: (id: string) => string
  toneOf: (id: string) => Tone
}

/**
 * Двое: я и партнёр, их имена и цвета.
 *
 * Разделы «на двоих» - вопрос дня, челленджи, копилка - все начинаются
 * с одних и тех же пяти строк про профили. Здесь они один раз, и цвет
 * человека берётся по тому же правилу, что везде (personTone): по порядку
 * идентификаторов, а не «я / партнёр».
 */
export function usePair(): Pair & { isPending: boolean } {
  const t = useT()
  const userId = useUserId()
  const profiles = useProfiles()
  const list = profiles.data ?? []
  const me = list.find((p) => p.userId === userId)
  const partner = list.find((p) => p.userId !== userId)
  const ids = list.map((p) => p.userId)
  const myName = me?.nickname ?? t('diary.me')
  const partnerName = partner?.nickname ?? t('partner')
  const partnerId = partner?.userId ?? ''

  return {
    isPending: profiles.isPending,
    userId,
    partnerId,
    ids,
    me,
    partner,
    myName,
    partnerName,
    myTone: personTone(userId, ids),
    partnerTone: personTone(partnerId, ids),
    nameOf: (id) => (id === userId ? myName : id === partnerId ? partnerName : t('partner')),
    toneOf: (id) => personTone(id, ids),
  }
}
