import { useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Dices, Hourglass, Sparkle, X } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { formatDayMonth } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { useBurst } from '@/ui/Burst'
import { Card, SectionTitle } from '@/ui/Card'
import { ShineBorder } from '@/ui/ShineBorder'
import { Sparkles } from '@/ui/Sparkles'
import { ErrorState, Loading } from '@/ui/States'
import { toneVar } from '@/ui/tones'
import { useAnswer, useCreateRound, useRounds } from './api'
import { doneBy, nextPair, pickPairs, scoreOf, type Round } from './logic'

/**
 * «Это или то»: насколько хорошо мы знаем друг друга.
 *
 * Раунд - десять пар. В каждой - два шага: что ближе тебе и что, по-твоему,
 * выберет второй. Ответы второго открываются, когда свой раунд пройден, -
 * это держит RLS, - и итог показывает, сколько угадал каждый и в чём совпали
 * вкусы. Ответы окончательные: переиграть пару, узнав выбор второго, - уже
 * не игра.
 */
export function QuizPage() {
  const t = useT()
  const pair = usePair()
  const rounds = useRounds()

  if (rounds.isError) return <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />
  if (rounds.isPending || pair.isPending) return <Loading />

  const list = rounds.data
  const current = list[0]
  const finished = list.filter((r) => scoreOf(r, pair.userId, pair.partnerId) !== null)
  const open = current && scoreOf(current, pair.userId, pair.partnerId) === null ? current : null

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <Hero pair={pair} last={finished[0] ?? null} played={finished.length} />

      {open ? (
        doneBy(open, pair.userId) ? (
          <Waiting round={open} pair={pair} />
        ) : (
          <Play round={open} pair={pair} />
        )
      ) : (
        <NewRound rounds={list} />
      )}

      {finished[0] && <Results round={finished[0]} pair={pair} />}

      {finished.length > 1 && (
        <>
          <SectionTitle className="mt-3">{t('tot.history')}</SectionTitle>
          <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
            {finished.slice(1).map((r) => {
              const s = scoreOf(r, pair.userId, pair.partnerId)
              if (!s) return null
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 text-muted">{formatDayMonth(new Date(r.createdAt))}</span>
                  <span className="tabular-nums">
                    {t('tot.short', { mine: s.myGuesses, theirs: s.theirGuesses, total: s.total })}
                  </span>
                </div>
              )
            })}
          </Card>
        </>
      )}
    </div>
  )
}

function Hero({ pair, last, played }: { pair: Pair; last: Round | null; played: number }) {
  const t = useT()
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)
  const score = last ? scoreOf(last, pair.userId, pair.partnerId) : null
  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] bg-surface p-5 shadow-card"
      style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
    >
      <Aurora colors={[a, b, 'var(--t-amber)']} />
      <Dices aria-hidden size={120} strokeWidth={1.3} className="pointer-events-none absolute -top-4 -right-5 rotate-12 text-ink opacity-[0.06]" />
      <p className="font-display text-[22px] leading-tight font-extrabold tracking-tight">{t('tot.title')}</p>
      <p className="mt-1.5 text-sm text-muted">{t('tot.subtitle')}</p>
      {score && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat name={pair.myName} tone={pair.myTone} value={`${score.myGuesses}/${score.total}`} label={t('tot.guessed')} />
          <Stat name={pair.partnerName} tone={pair.partnerTone} value={`${score.theirGuesses}/${score.total}`} label={t('tot.guessed')} />
        </div>
      )}
      {played > 0 && <p className="mt-3 text-[13px] text-muted">{t('tot.played', { n: played })}</p>}
    </section>
  )
}

function Stat({ name, tone, value, label }: { name: string; tone: Pair['myTone']; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface/75 p-2.5 backdrop-blur">
      <Avatar name={name} tone={tone} size="sm" />
      <div className="min-w-0">
        <p className="font-display text-xl leading-none font-extrabold tabular-nums">{value}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">{label}</p>
      </div>
    </div>
  )
}

function NewRound({ rounds }: { rounds: readonly Round[] }) {
  const t = useT()
  const create = useCreateRound()
  const used = new Set(rounds.flatMap((r) => r.pairs))
  return (
    <Card className="p-5 text-center">
      <p className="text-[15px] text-muted">{t('tot.howTo')}</p>
      <Button className="mt-4 w-full" loading={create.isPending} onClick={() => create.mutate(pickPairs(used))}>
        <Dices size={18} aria-hidden />
        {t('tot.start')}
      </Button>
    </Card>
  )
}

/**
 * Игра: пара за парой, два шага в каждой. Ответ уходит в базу, когда
 * сделаны оба шага, - и сразу показывается следующая пара (оптимистично).
 */
function Play({ round, pair }: { round: Round; pair: Pair }) {
  const t = useT()
  const answer = useAnswer()
  const burst = useBurst()
  const [pick, setPick] = useState<0 | 1 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = nextPair(round, pair.userId)
  if (!current) return null

  const index = round.pairs.indexOf(current)
  const step: 'self' | 'guess' = pick === null ? 'self' : 'guess'
  const options: [string, string] = [t(dynamicKey('tot', `${current}.a`)), t(dynamicKey('tot', `${current}.b`))]

  const choose = (value: 0 | 1, el: HTMLElement) => {
    setError(null)
    if (step === 'self') {
      setPick(value)
      return
    }
    // Этим ответом раунд пройден - разлёт искр
    const last = round.answers.filter((a) => a.userId === pair.userId).length === round.pairs.length - 1
    const r = el.getBoundingClientRect()
    answer.mutate(
      { roundId: round.id, userId: pair.userId, pairId: current, pick: pick ?? 0, guess: value },
      {
        onSuccess: () => {
          if (last) burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 'sparks')
        },
        onError: (e) => setError(e.message),
      },
    )
    setPick(null)
  }

  return (
    <Card className="overflow-hidden p-5">
      {/* Прогресс - десять точек: пройденные залиты */}
      <div className="flex justify-center gap-1.5" aria-label={t('tot.progress', { n: index + 1, total: round.pairs.length })}>
        {round.pairs.map((p, i) => (
          <span
            key={p}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'w-5 bg-accent' : round.answers.some((a) => a.userId === pair.userId && a.pairId === p) ? 'w-1.5 bg-accent/60' : 'w-1.5 bg-raised'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${current}-${step}`}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22 }}
        >
          <div className="mt-5 flex items-center justify-center gap-2">
            {step === 'guess' && <Avatar name={pair.partnerName} tone={pair.partnerTone} size="sm" />}
            <p className="text-center font-display text-lg font-extrabold">
              {step === 'self' ? t('tot.askSelf') : t('tot.askGuess', { name: pair.partnerName })}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {options.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => choose(i as 0 | 1, e.currentTarget)}
                className={`flex min-h-28 items-center justify-center rounded-3xl p-4 text-center font-display text-[17px] leading-tight font-extrabold
                            transition-transform active:scale-95 ${
                              i === 0 ? 'bg-tone-sky-soft text-tone-sky' : 'bg-tone-rose-soft text-tone-rose'
                            } ${step === 'guess' && pick === i ? 'ring-2 ring-accent/40' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          {step === 'guess' && (
            <p className="mt-3 text-center text-[13px] text-muted">
              {t('tot.yourPick', { option: options[pick ?? 0] })}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
      {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
    </Card>
  )
}

function Waiting({ round, pair }: { round: Round; pair: Pair }) {
  const t = useT()
  const theirs = round.answered[pair.partnerId] ?? 0
  return (
    <Card className="flex items-center gap-3 p-4">
      <Avatar name={pair.partnerName} tone={pair.partnerTone} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{pair.partnerName}</p>
        <p className="mt-0.5 text-sm text-muted">
          {theirs === 0 ? t('tot.notStarted') : t('tot.inProgress', { n: theirs, total: round.pairs.length })}
        </p>
      </div>
      <Hourglass size={20} aria-hidden className="shrink-0 text-muted" />
    </Card>
  )
}

/**
 * Итог раунда: в каждой паре - кто что выбрал (аватары у вариантов)
 * и чьи догадки сбылись. Совпавшие вкусы отмечены звёздочкой.
 */
function Results({ round, pair }: { round: Round; pair: Pair }) {
  const t = useT()
  const score = scoreOf(round, pair.userId, pair.partnerId)
  if (!score) return null
  const of = (who: string, id: string) => round.answers.find((a) => a.userId === who && a.pairId === id)
  const perfect = score.myGuesses === score.total && score.theirGuesses === score.total
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)

  return (
    <Card className="relative overflow-hidden p-4">
      {perfect && <ShineBorder colors={[a, 'var(--c-accent)', b]} />}
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t('tot.lastRound')}</SectionTitle>
        <span className="text-[13px] text-muted">{t('tot.same', { n: score.same, total: score.total })}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {round.pairs.map((id) => {
          const mine = of(pair.userId, id)
          const theirs = of(pair.partnerId, id)
          if (!mine || !theirs) return null
          const same = mine.pick === theirs.pick
          return (
            <li key={id} className="rounded-2xl bg-raised p-2.5">
              <div className="grid grid-cols-2 gap-2">
                {([0, 1] as const).map((side) => (
                  <div
                    key={side}
                    className={`flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[14px] font-semibold ${
                      mine.pick === side || theirs.pick === side ? 'bg-surface' : 'text-muted'
                    }`}
                  >
                    <span className="min-w-0 flex-1 leading-tight">{t(dynamicKey('tot', `${id}.${side === 0 ? 'a' : 'b'}`))}</span>
                    {/* Аватары внахлёст: рядом по отдельности они сжимали
                        вариант в столбик по слову */}
                    <span className="flex shrink-0 -space-x-2">
                      {mine.pick === side && <Avatar name={pair.myName} tone={pair.myTone} size="sm" ring />}
                      {theirs.pick === side && <Avatar name={pair.partnerName} tone={pair.partnerTone} size="sm" ring />}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] text-muted">
                <Guess ok={mine.guess === theirs.pick} label={t('tot.guessOf', { name: pair.myName })} />
                <Guess ok={theirs.guess === mine.pick} label={t('tot.guessOf', { name: pair.partnerName })} />
                {same && (
                  <span className="flex items-center gap-1 text-tone-amber">
                    <Sparkle size={12} aria-hidden className="fill-current" />
                    {t('tot.sameTaste')}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {perfect && (
        <Sparkles count={4} className="mx-auto mt-3 block w-fit">
          <p className="text-sm font-semibold text-tone-green">{t('tot.perfect')}</p>
        </Sparkles>
      )}
    </Card>
  )
}

function Guess({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 ${ok ? 'text-tone-green' : ''}`}>
      {ok ? <Check size={12} strokeWidth={3} aria-hidden /> : <X size={12} aria-hidden />}
      {label}
    </span>
  )
}
