import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Flame, Lock, MessageCircleHeart, Pencil, SendHorizontal } from 'lucide-react'
import { dynamicKey, useT } from '@/lib/i18n'
import { formatDayLabel, formatWeekdayDate, fromLocalISO, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Aurora } from '@/ui/Aurora'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Card, SectionTitle } from '@/ui/Card'
import { INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Sheet } from '@/ui/Sheet'
import { ShineBorder } from '@/ui/ShineBorder'
import { ErrorState, Loading } from '@/ui/States'
import { useBurst } from '@/ui/Burst'
import { TONE_CLASS, toneVar } from '@/ui/tones'
import { CATEGORY_ICON, CATEGORY_TONE } from './bank'
import { useAnswers, useProgress, useSaveAnswer, type Answer } from './api'
import { archiveDates, dayOf, jointStreak, type Day } from './logic'

const MAX_LENGTH = 1000
const PAGE = 10

/**
 * Вопрос дня.
 *
 * Один вопрос на двоих в день, ответ второго открывается после своего.
 * Слепота - главное свойство раздела, и держит её база (RLS), а не экран:
 * здесь чужой ответ просто не приходит, пока нет своего.
 *
 * Сверху сегодняшний вопрос, ниже - архив. В архиве на пропущенный день
 * можно ответить задним числом: вопрос не сгорает, а ответ второго
 * за тот день откроется так же, как сегодняшний.
 */
export function QuestionPage() {
  const t = useT()
  const pair = usePair()
  const today = todayLocal()
  const answers = useAnswers()
  const progress = useProgress()
  const [past, setPast] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)

  if (answers.isError) return <ErrorState error={answers.error} onRetry={() => void answers.refetch()} />
  if (progress.isError) return <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />
  if (answers.isPending || progress.isPending || pair.isPending) return <Loading />

  const day = dayOf(today, pair.userId, answers.data, progress.data)
  const streak = jointStreak(progress.data, pair.userId, pair.partnerId, today)
  const archive = archiveDates(progress.data, today)

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <QuestionHero day={day} pair={pair} label={formatWeekdayDate(fromLocalISO(today))} />

      <DayAnswers day={day} pair={pair} />

      {streak >= 2 && (
        <Card className="flex items-center gap-3 px-4 py-3.5">
          <span className="flicker text-tone-orange">
            <Flame size={24} strokeWidth={2.2} aria-hidden />
          </span>
          <p className="text-[15px] font-semibold">
            {t('qd.streak', { n: streak, unit: t.plural('unit.day', streak) })}
          </p>
        </Card>
      )}

      {archive.length > 0 && (
        <>
          <SectionTitle className="mt-3">{t('qd.archive')}</SectionTitle>
          {archive.slice(0, shown).map((date) => (
            <PastDay
              key={date}
              day={dayOf(date, pair.userId, answers.data, progress.data)}
              pair={pair}
              onAnswer={() => setPast(date)}
            />
          ))}
          {archive.length > shown && (
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
              {t('qd.showMore')}
            </Button>
          )}
        </>
      )}

      {past && (
        <PastSheet
          day={dayOf(past, pair.userId, answers.data, progress.data)}
          pair={pair}
          onClose={() => setPast(null)}
        />
      )}
    </div>
  )
}

/** Текст вопроса - или честное «вопрос из другой версии», если id незнаком. */
function useQuestionText(): (day: Day) => string {
  const t = useT()
  return (day) => (day.question ? t(dynamicKey('q', day.question.id)) : t('qd.unknown'))
}

/**
 * Карточка вопроса: сияние в цветах пары, категория, сам вопрос и под ним
 * двое - кто уже ответил. Когда открыты оба ответа, по рамке идёт сияние.
 */
function QuestionHero({ day, pair, label }: { day: Day; pair: Pair; label: string }) {
  const t = useT()
  const text = useQuestionText()
  const cat = day.question?.cat
  const Icon = cat ? CATEGORY_ICON[cat] : MessageCircleHeart
  const revealed = day.mine !== null && day.partnerAnswered
  const a = toneVar(pair.myTone)
  const b = toneVar(pair.partnerTone)

  return (
    <section
      className="relative isolate overflow-hidden rounded-[28px] bg-surface px-5 pt-5 pb-4 shadow-card"
      style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
    >
      {revealed && <ShineBorder colors={[a, 'var(--c-accent)', b]} />}
      <Aurora colors={[a, b, 'var(--c-accent)']} />
      {/* Крупный значок вопроса фоном - карточка читается как «вопрос»
          раньше, чем прочитан текст */}
      <MessageCircleHeart
        aria-hidden
        size={132}
        strokeWidth={1.4}
        className="pointer-events-none absolute -top-5 -right-6 rotate-12 text-ink opacity-[0.06]"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-surface/75 px-3 py-1 text-[13px] font-semibold backdrop-blur">
          <Icon size={14} aria-hidden className={cat ? TONE_CLASS[CATEGORY_TONE[cat]].fg : 'text-muted'} />
          <span className="truncate">{cat ? t(dynamicKey('qcat', cat)) : t('nav.question')}</span>
        </span>
        <span className="truncate text-[13px] font-medium text-muted first-letter:uppercase">{label}</span>
      </div>

      <p className="mt-4 font-display text-[24px] leading-[1.22] font-extrabold tracking-tight text-balance">
        {text(day)}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <WhoPill name={pair.myName} tone={pair.myTone} done={day.mine !== null} label={day.mine ? t('qd.ready') : t('qd.yourTurn')} />
        {pair.partnerId !== '' && (
          <WhoPill
            name={pair.partnerName}
            tone={pair.partnerTone}
            done={day.partnerAnswered}
            label={day.partnerAnswered ? t('qd.ready') : t('qd.thinking')}
          />
        )}
      </div>
    </section>
  )
}

function WhoPill({ name, tone, done, label }: { name: string; tone: Pair['myTone']; done: boolean; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-full bg-surface/75 py-1 pr-3 pl-1 backdrop-blur">
      <Avatar name={name} tone={tone} size="sm" />
      <span className="min-w-0 truncate text-[13px]">
        <span className="font-semibold">{name}</span>
        <span className="text-muted"> · {label}</span>
      </span>
      {done && <Check size={15} strokeWidth={2.6} aria-hidden className="shrink-0 text-tone-green" />}
    </span>
  )
}

/**
 * Ответы дня: поле для своего, свой с чужим замком - или оба.
 *
 * Свой ответ можно поправить, пока второй не ответил. После этого правка
 * закрыта политикой базы: переписать ответ, прочитав чужой, - ровно то,
 * от чего защищает слепота.
 */
function DayAnswers({ day, pair }: { day: Day; pair: Pair }) {
  const t = useT()
  const [editing, setEditing] = useState(false)

  if (day.mine === null || editing) {
    return (
      <Card className="p-4">
        <Composer
          day={day}
          pair={pair}
          initial={day.mine?.body ?? ''}
          onDone={() => setEditing(false)}
          {...(editing ? { onCancel: () => setEditing(false) } : {})}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <AnswerCard
        answer={day.mine}
        name={pair.myName}
        tone={pair.myTone}
        action={
          day.partnerAnswered ? undefined : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-[13px] font-semibold text-muted transition-transform active:scale-95"
            >
              <Pencil size={14} aria-hidden />
              {t('common.edit')}
            </button>
          )
        }
      />
      {pair.partnerId !== '' &&
        (day.theirs ? (
          <AnswerCard answer={day.theirs} name={pair.partnerName} tone={pair.partnerTone} delay={0.12} />
        ) : (
          <LockedCard name={pair.partnerName} tone={pair.partnerTone} />
        ))}
    </div>
  )
}

/**
 * Поле ответа. После успешной отправки - разлёт: искры, а если этим ответом
 * открылись оба - сердца. Точка разлёта запоминается до отправки: после неё
 * поле заменится карточкой, и кнопки уже не будет.
 */
function Composer({
  day,
  pair,
  initial,
  onDone,
  onCancel,
}: {
  day: Day
  pair: Pair
  initial: string
  onDone: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const save = useSaveAnswer()
  const burst = useBurst()
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const trimmed = text.trim()

  const submit = async (from: HTMLElement) => {
    setError(null)
    if (trimmed === '') {
      setError(t('qd.empty'))
      return
    }
    const rect = from.getBoundingClientRect()
    try {
      await save.mutateAsync({
        userId: pair.userId,
        date: day.date,
        questionId: day.questionId,
        body: trimmed,
        existing: day.mine !== null,
      })
      burst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, day.partnerAnswered ? 'hearts' : 'sparks')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
        rows={4}
        placeholder={t('qd.placeholder')}
        aria-label={t('qd.yourAnswer')}
        className={`${INPUT_CLASS} min-h-28 resize-none leading-relaxed [field-sizing:content]`}
      />
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Lock size={14} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1">{t('qd.blindHint')}</span>
        {text.length > MAX_LENGTH * 0.8 && (
          <span className="shrink-0 tabular-nums">
            {text.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            {t('common.cancel')}
          </Button>
        )}
        <Button onClick={(e) => void submit(e.currentTarget)} loading={save.isPending} disabled={trimmed === ''} className="flex-1">
          <SendHorizontal size={18} aria-hidden />
          {day.mine ? t('common.save') : t('qd.answer')}
        </Button>
      </div>
    </div>
  )
}

function AnswerCard({
  answer,
  name,
  tone,
  action,
  delay = 0,
}: {
  answer: Answer
  name: string
  tone: Pair['myTone']
  action?: ReactNode | undefined
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay }}
    >
      <Card className="relative overflow-hidden p-4">
        {/* Полоска цветом человека слева - чей ответ, видно раньше имени */}
        <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${TONE_CLASS[tone].solid}`} />
        <div className="flex items-center gap-2.5">
          <Avatar name={name} tone={tone} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
          {action}
        </div>
        <p className="mt-2.5 text-[16px] leading-relaxed whitespace-pre-wrap">{answer.body}</p>
      </Card>
    </motion.div>
  )
}

/** Ответа второго ещё нет - или он есть, но откроется после своего. */
function LockedCard({ name, tone }: { name: string; tone: Pair['myTone'] }) {
  const t = useT()
  return (
    <Card className="flex items-center gap-3 p-4">
      <Avatar name={name} tone={tone} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          {t('qd.waiting')}
          <Dots />
        </p>
      </div>
      <IconBadge icon={Lock} tone="slate" size="sm" />
    </Card>
  )
}

/** Три точки «печатает…» - только прозрачность, её «уменьшить движение» не трогает. */
function Dots() {
  return (
    <span aria-hidden className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  )
}

/**
 * День в архиве. Ответы открыты - оба целиком по тапу; ответил только
 * второй - кнопка ответить, чтобы увидеть.
 */
function PastDay({ day, pair, onAnswer }: { day: Day; pair: Pair; onAnswer: () => void }) {
  const t = useT()
  const text = useQuestionText()
  const [open, setOpen] = useState(false)
  const cat = day.question?.cat
  const Icon = cat ? CATEGORY_ICON[cat] : MessageCircleHeart
  const both = day.mine !== null && day.theirs !== null

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!both}
        aria-expanded={both ? open : undefined}
        className="block w-full text-left"
      >
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <Icon size={14} aria-hidden className={cat ? TONE_CLASS[CATEGORY_TONE[cat]].fg : ''} />
          <span className="first-letter:uppercase">{formatDayLabel(day.date)}</span>
        </span>
        <span className="mt-1.5 block text-[15px] leading-snug font-semibold">{text(day)}</span>
      </button>

      {both && day.mine && day.theirs ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <PastLine name={pair.myName} tone={pair.myTone} body={day.mine.body} open={open} />
          <PastLine name={pair.partnerName} tone={pair.partnerTone} body={day.theirs.body} open={open} />
        </div>
      ) : day.mine ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <PastLine name={pair.myName} tone={pair.myTone} body={day.mine.body} open />
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Lock size={14} aria-hidden />
            {pair.partnerName}: {t('qd.thinking')}
          </p>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted">
            {day.partnerAnswered ? (
              <>
                <Lock size={14} aria-hidden className="shrink-0" />
                <span className="truncate">
                  {pair.partnerName}: {t('qd.ready')}
                </span>
              </>
            ) : (
              t('qd.noAnswers')
            )}
          </p>
          <button
            type="button"
            onClick={onAnswer}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent-soft-ink transition-transform active:scale-95"
          >
            {t('qd.answer')}
          </button>
        </div>
      )}
    </Card>
  )
}

function PastLine({ name, tone, body, open }: { name: string; tone: Pair['myTone']; body: string; open: boolean }) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={name} tone={tone} size="sm" />
      <p className={`min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap ${open ? '' : 'line-clamp-3'}`}>
        {body}
      </p>
    </div>
  )
}

/** Ответ на прошлый день - в шторке, с тем же полем, что и сегодня. */
function PastSheet({ day, pair, onClose }: { day: Day; pair: Pair; onClose: () => void }) {
  const text = useQuestionText()
  return (
    <Sheet open onClose={onClose} title={formatDayLabel(day.date)}>
      <div className="flex flex-col gap-4">
        <p className="font-display text-xl leading-snug font-extrabold">{text(day)}</p>
        <Composer day={day} pair={pair} initial={day.mine?.body ?? ''} onDone={onClose} />
      </div>
    </Sheet>
  )
}
