import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Heart, Plus, Undo2, X } from 'lucide-react'
import { dynamicKey, useLang, useT } from '@/lib/i18n'
import { usePair } from '@/features/profile/pair'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { Sparkles } from '@/ui/Sparkles'
import { ErrorState, Loading } from '@/ui/States'
import { RoundButton, SwipeCard } from '@/ui/SwipeCard'
import { useAddName, useBabyNames, useMatches, useMyVotes, useVote, type BabyName, type Gender, type Origin } from './api'

const ORIGINS: readonly Origin[] = ['kazakh', 'slavic', 'intl', 'custom']

/**
 * Имя для малыша.
 *
 * Каждый листает имена сам: вправо - нравится, влево - нет. Имя всплывает
 * в «нравится обоим», только когда его отметили оба. Чужие голоса не видны
 * вовсе - ни «да», ни «нет» (RLS): спорить не о чем, а отказ второго не
 * ранит, потому что о нём никто не узнает.
 */
export function NamesPage() {
  const t = useT()
  const pair = usePair()
  const names = useBabyNames()
  const votes = useMyVotes()
  const matches = useMatches()
  const burst = useBurst()
  const [gender, setGender] = useState<'f' | 'm' | 'all'>('all')
  const [origins, setOrigins] = useState<Set<Origin>>(new Set())
  const [history, setHistory] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [justMatched, setJustMatched] = useState<string | null>(null)

  const vote = useVote((key) => {
    setJustMatched(key)
    burst({ x: window.innerWidth / 2, y: window.innerHeight / 2.4 }, 'hearts')
  })

  const deck = useMemo(
    () =>
      (names.data ?? []).filter(
        (n) =>
          votes.data?.[n.key] === undefined &&
          (gender === 'all' || n.gender === gender || n.gender === 'u') &&
          (origins.size === 0 || origins.has(n.origin)),
      ),
    [names.data, votes.data, gender, origins],
  )

  if (names.isError) return <ErrorState error={names.error} onRetry={() => void names.refetch()} />
  if (names.isPending || votes.isPending || pair.isPending) return <Loading />

  const byKey = new Map((names.data ?? []).map((n) => [n.key, n]))
  const top = deck[0]
  const liked = Object.values(votes.data ?? {}).filter(Boolean).length

  const decide = (key: string, liked: boolean) => {
    setHistory((h) => [...h, key])
    vote.mutate({ userId: pair.userId, key, liked })
  }
  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    vote.mutate({ userId: pair.userId, key: last, liked: null })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Segmented
        value={gender}
        onChange={setGender}
        options={[
          { value: 'f', label: t('nm.girls') },
          { value: 'm', label: t('nm.boys') },
          { value: 'all', label: t('nm.all') },
        ]}
      />
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {ORIGINS.map((o) => (
            <Chip
              key={o}
              selected={origins.has(o)}
              onClick={() =>
                setOrigins((s) => {
                  const next = new Set(s)
                  if (next.has(o)) next.delete(o)
                  else next.add(o)
                  return next
                })
              }
            >
              {t(dynamicKey('nm.origin', o))}
            </Chip>
          ))}
        </div>
      </div>

      {/* Колода: верхняя карточка тянется пальцем, под ней видна следующая */}
      <div className="relative h-[300px]">
        <AnimatePresence initial={false}>
          {top ? (
            <>
              {deck[1] && <NameCard key={deck[1].key + '-under'} name={deck[1]} under />}
              <SwipeCard key={top.key} yes={t('nm.yes')} no={t('nm.no')} onDecide={(liked) => decide(top.key, liked)}>
                <NameCard name={top} />
              </SwipeCard>
            </>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center rounded-[28px] bg-surface p-6 text-center shadow-card"
            >
              <p className="font-display text-lg font-extrabold">{t('nm.deckDone')}</p>
              <p className="mt-1 text-sm text-muted">{t('nm.deckDoneHint')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-4">
        <RoundButton label={t('nm.undo')} onClick={undo} disabled={history.length === 0} small>
          <Undo2 size={20} aria-hidden />
        </RoundButton>
        <RoundButton label={t('nm.no')} onClick={() => top && decide(top.key, false)} disabled={!top}>
          <X size={28} aria-hidden />
        </RoundButton>
        <RoundButton label={t('nm.yes')} onClick={() => top && decide(top.key, true)} disabled={!top} accent>
          <Heart size={28} aria-hidden className="fill-current" />
        </RoundButton>
        <RoundButton label={t('nm.add')} onClick={() => setAdding(true)} small>
          <Plus size={20} aria-hidden />
        </RoundButton>
      </div>
      <p className="text-center text-[13px] text-muted">
        {t('nm.left', { n: deck.length })} · {t('nm.liked', { n: liked })}
      </p>

      <SectionTitle className="mt-3">
        {t('nm.matches')} {(matches.data?.length ?? 0) > 0 && `· ${matches.data?.length}`}
      </SectionTitle>
      {(matches.data ?? []).length === 0 ? (
        <Card className="p-4 text-sm text-muted">{t('nm.noMatches')}</Card>
      ) : (
        <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
          {(matches.data ?? []).map((m) => {
            const n = byKey.get(m.key)
            if (!n) return null
            return <MatchRow key={m.key} name={n} fresh={m.key === justMatched} />
          })}
        </Card>
      )}

      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </div>
  )
}

function useMeaning(): (n: BabyName) => string | null {
  const { lang } = useLang()
  return (n) => n.meaning[lang] ?? null
}

/** Карточка имени. Цвет - по полу: девочки - тёплые, мальчики - холодные. */
function NameCard({ name, under = false }: { name: BabyName; under?: boolean }) {
  const t = useT()
  const meaning = useMeaning()
  const tone = name.gender === 'f' ? 'from-tone-rose-soft' : name.gender === 'm' ? 'from-tone-sky-soft' : 'from-tone-violet-soft'
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center rounded-[28px] bg-gradient-to-b ${tone} to-surface p-6 text-center shadow-card ${
        under ? 'scale-[0.95] opacity-60' : ''
      }`}
    >
      <span className="rounded-full bg-surface/70 px-3 py-1 text-[12px] font-semibold text-muted">
        {t(dynamicKey('nm.origin', name.origin))}
      </span>
      <p className="mt-4 font-display text-[44px] leading-none font-extrabold tracking-tight">{name.name}</p>
      {name.latin && <p className="mt-1.5 text-sm text-muted">{name.latin}</p>}
      {meaning(name) && <p className="mt-4 max-w-[16rem] text-[15px] leading-snug">{meaning(name)}</p>}
    </div>
  )
}

function MatchRow({ name, fresh }: { name: BabyName; fresh: boolean }) {
  const meaning = useMeaning()
  const content = (
    <span className="font-display text-lg font-extrabold">{name.name}</span>
  )
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Heart size={18} aria-hidden className="shrink-0 fill-accent text-accent" />
      <div className="min-w-0 flex-1">
        {fresh ? <Sparkles count={3}>{content}</Sparkles> : content}
        {meaning(name) && <p className="truncate text-[13px] text-muted">{meaning(name)}</p>}
      </div>
      <span className={`text-[12px] font-semibold ${name.gender === 'f' ? 'text-tone-rose' : name.gender === 'm' ? 'text-tone-sky' : 'text-tone-violet'}`}>
        {name.latin ?? ''}
      </span>
    </div>
  )
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const pair = usePair()
  const add = useAddName()
  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('f')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={t('nm.add')}>
      <div className="flex flex-col gap-4">
        <Field label={t('nm.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        <Segmented
          value={gender}
          onChange={setGender}
          options={[
            { value: 'f', label: t('nm.girl') },
            { value: 'm', label: t('nm.boy') },
            { value: 'u', label: t('nm.any') },
          ]}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={add.isPending}
          disabled={name.trim() === ''}
          onClick={() =>
            add.mutate({ userId: pair.userId, name, gender }, { onSuccess: onClose, onError: (e) => setError(e.message) })
          }
        >
          {t('common.add')}
        </Button>
      </div>
    </Sheet>
  )
}
