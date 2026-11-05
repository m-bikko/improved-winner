import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake, MessagesSquare, Pin, PinOff } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayMonthYear } from '@/lib/date'
import { usePair } from '@/features/profile/pair'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Card, SectionTitle } from '@/ui/Card'
import { Fab } from '@/ui/Fab'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { SearchInput } from '@/ui/SearchInput'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { TONE_CLASS } from '@/ui/tones'
import { useAgreements, useCreateAgreement, usePinAgreement } from './api'
import { matches, type Agreement } from './logic'

/**
 * Наши договорённости.
 *
 * Решение закрытой темы - это и есть договорённость: «крупные покупки
 * обсуждаем заранее». Раньше каждое такое решение лежало в своей теме,
 * и через полгода его было не найти. Здесь они вместе, важные закреплены
 * наверху, у каждой - ссылка на обсуждение, из которого она выросла.
 */
export function AgreementsPage() {
  const t = useT()
  const agreements = useAgreements()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  if (agreements.isError) return <ErrorState error={agreements.error} onRetry={() => void agreements.refetch()} />
  if (agreements.isPending) return <Loading />

  const list = agreements.data.filter((a) => matches(a, query))
  const pinned = list.filter((a) => a.pinnedAt !== null).sort((a, b) => ((a.pinnedAt ?? '') < (b.pinnedAt ?? '') ? 1 : -1))
  const rest = list.filter((a) => a.pinnedAt === null)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      {agreements.data.length > 0 && <SearchInput value={query} onChange={setQuery} placeholder={t('ag.search')} />}

      {agreements.data.length === 0 ? (
        <EmptyState
          icon={Handshake}
          tone="indigo"
          title={t('ag.emptyTitle')}
          hint={t('ag.emptyHint')}
          action={<Button onClick={() => setCreating(true)}>{t('ag.new')}</Button>}
        />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('ag.nothingFound')}</p>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <SectionTitle>{t('ag.pinned')}</SectionTitle>
              {pinned.map((a) => (
                <AgreementCard key={a.id} a={a} />
              ))}
            </>
          )}
          {rest.length > 0 && pinned.length > 0 && <SectionTitle className="mt-3">{t('ag.all')}</SectionTitle>}
          {rest.map((a) => (
            <AgreementCard key={a.id} a={a} />
          ))}
        </>
      )}

      <Fab onClick={() => setCreating(true)} label={t('ag.new')} />
      {creating && <CreateSheet onClose={() => setCreating(false)} />}
    </div>
  )
}

function AgreementCard({ a }: { a: Agreement }) {
  const t = useT()
  const pair = usePair()
  const pin = usePinAgreement()
  const pinned = a.pinnedAt !== null
  const tone = pair.toneOf(a.closedBy)

  return (
    <Card as="article" className="relative overflow-hidden p-4">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 pt-0.5 text-[15px] leading-snug font-semibold">{a.title}</p>
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={pinned ? t('ag.unpin') : t('ag.pin')}
          onClick={() => pin.mutate({ id: a.id, pinned: !pinned })}
          className={`-mt-1.5 -mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-raised ${
            pinned ? 'text-accent' : 'text-muted/70'
          }`}
        >
          {pinned ? <PinOff size={17} aria-hidden /> : <Pin size={17} aria-hidden />}
        </button>
      </div>
      {/* Решение - главное, поэтому крупнее названия и с полоской цветом того,
          кто его записал */}
      <blockquote className="relative mt-2 pl-3.5 text-[16px] leading-relaxed whitespace-pre-wrap">
        <span aria-hidden className={`absolute inset-y-1 left-0 w-1 rounded-full ${TONE_CLASS[tone].solid}`} />
        {a.resolution}
      </blockquote>
      <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
        <Avatar name={pair.nameOf(a.closedBy)} tone={tone} size="sm" />
        <span className="min-w-0 flex-1 truncate">{formatDayMonthYear(new Date(a.closedAt))}</span>
        <Link to={`/topics/${a.id}`} className="-my-2 flex min-h-10 items-center gap-1 pl-2 font-semibold text-accent active:opacity-50">
          <MessagesSquare size={14} aria-hidden />
          {t('ag.discussion')}
        </Link>
      </div>
    </Card>
  )
}

function CreateSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const pair = usePair()
  const create = useCreateAgreement()
  const [title, setTitle] = useState('')
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (title.trim() === '' || resolution.trim() === '') return setError(t('ag.fillBoth'))
    create.mutate(
      { title, resolution, userId: pair.userId },
      { onSuccess: onClose, onError: (e) => setError(e.message) },
    )
  }

  return (
    <Sheet open onClose={onClose} title={t('ag.new')}>
      <div className="flex flex-col gap-4">
        <Field label={t('ag.about')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('ag.aboutPlaceholder')} autoFocus />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('ag.decided')}</span>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            placeholder={t('ag.decidedPlaceholder')}
            className={`${INPUT_CLASS} resize-none [field-sizing:content] min-h-24`}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={submit} loading={create.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
