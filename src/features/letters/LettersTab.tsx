import { useT } from '@/lib/i18n'
import { useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, Mail, MailOpen, X } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatDayMonthYear, fromLocalISO, shiftDays, todayLocal } from '@/lib/date'
import { formatBytes, prepareImage, type PreparedImage } from '@/lib/image'
import { Button } from '@/ui/Button'
import { Card as Surface } from '@/ui/Card'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { PhotoViewer } from '@/ui/PhotoViewer'
import { Sheet } from '@/ui/Sheet'
import { EmptyState, ErrorState, Loading } from '@/ui/States'
import { useProfiles } from '@/features/profile/api'
import {
  useLetterPhotoUrls,
  useLetters,
  useLettersInFlight,
  useSaveLetter,
  type Letter,
  type LetterAudience,
} from './api'
import { Fab } from '@/ui/Fab'
import { Segmented } from '@/ui/Segmented'

function day(iso: string): string {
  return formatDayMonthYear(fromLocalISO(iso))
}

/**
 * Письма в будущем.
 *
 * Запечатанного письма тут нет ни у кого - ни у адресата, ни у автора.
 * Раздел «В пути» со списком раньше портил сюрприз самому написавшему,
 * а для письма «обоим» обессмысливал затею целиком: написал и тут же
 * перечитываешь.
 *
 * Остаётся одно число - сколько своих писем в пути. Без него написанное
 * исчезает в никуда, и человек не может отличить «запечатано»
 * от «не сохранилось».
 *
 * Живут рядом с датами, а не отдельным разделом: и то и другое - «что будет»,
 * а меню и так из десяти пунктов.
 */
export function LettersTab() {
  const t = useT()
  const userId = useUserId()
  const letters = useLetters()
  const inFlight = useLettersInFlight()
  const [writing, setWriting] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

  const paths = useMemo(
    () =>
      (letters.data ?? []).map((l) => l.imagePath).filter((p): p is string => p !== null),
    [letters.data],
  )
  const urls = useLetterPhotoUrls(paths)

  if (letters.isError) {
    return <ErrorState error={letters.error} onRetry={() => void letters.refetch()} />
  }
  if (letters.isPending) return <Loading />

  const arrived = [...letters.data].sort((a, b) =>
    (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''),
  )
  const flying = inFlight.data ?? 0

  return (
    <>
      {arrived.length === 0 ? (
        <EmptyState
          title={t('letter.emptyTitle')}
          hint={t('letter.emptyHint')}
          icon={Mail}
          tone="teal"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {arrived.map((l) => (
            <li key={l.id}>
              <Card
                letter={l}
                userId={userId}
                url={l.imagePath ? urls.data?.[l.imagePath] : undefined}
                onView={setViewing}
              />
            </li>
          ))}
        </ul>
      )}

      {flying > 0 && (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-raised/60 px-4 py-3 text-sm text-muted">
          <Mail size={16} aria-hidden className="shrink-0 text-accent" />
          {t.plural('letter.flying', flying).replace('{n}', String(flying))}
        </p>
      )}

      <Fab onClick={() => setWriting(true)} label={t('letter.new')} />

      {writing && <Editor onClose={() => setWriting(false)} />}
      {viewing && (
        <PhotoViewer url={viewing} alt={t('letter.photoAlt')} onClose={() => setViewing(null)} />
      )}
    </>
  )
}

function Card({
  letter,
  userId,
  url,
  onView,
}: {
  letter: Letter
  userId: string
  url: string | undefined
  onView: (url: string) => void
}) {
  const t = useT()
  const profiles = useProfiles()
  const mine = letter.authorId === userId
  const author = profiles.data?.find((p) => p.userId === letter.authorId)?.nickname ?? t('partner')

  return (
    <Surface as="article" className="p-4">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={MailOpen} tone="teal" size="sm" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted">
          {t('letter.arrived', { day: day(letter.deliverOn) })}
          {!mine && ` · ${author}`}
          {mine && letter.audience === 'both' && t('letter.toBoth')}
        </p>
      </div>
      {url && (
        <button
          type="button"
          onClick={() => onView(url)}
          aria-label={t('letter.viewPhoto')}
          className="mt-3 block w-full overflow-hidden rounded-2xl bg-raised"
        >
          {/* object-contain, а не cover: снимок в письме не превью в сетке,
              и обрезать его - значит обрезать то, ради чего он приложен */}
          <img src={url} alt="" className="max-h-72 w-full object-contain" />
        </button>
      )}
      <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{letter.body}</p>
      <p className="mt-3 text-[13px] text-muted">
        {t('letter.written', { day: day(letter.createdAt.slice(0, 10)) })}
      </p>
    </Surface>
  )
}

function Editor({ onClose }: { onClose: () => void }) {
  const t = useT()
  const save = useSaveLetter()
  const [body, setBody] = useState('')
  // По умолчанию через год: письмо «на завтра» - это записка, а не письмо
  // в будущее, и предлагать завтрашний день значило бы подталкивать не к тому
  const [deliverOn, setDeliverOn] = useState(shiftDays(todayLocal(), 365))
  const [audience, setAudience] = useState<LetterAudience>('partner')
  const [error, setError] = useState<string | null>(null)
  const [sealed, setSealed] = useState(false)
  const [photo, setPhoto] = useState<{ prepared: PreparedImage; url: string; from: number } | null>(
    null,
  )
  const input = useRef<HTMLInputElement>(null)

  const pick = async (file: File) => {
    setError(null)
    try {
      const prepared = await prepareImage(file)
      setPhoto({ prepared, url: URL.createObjectURL(prepared.blob), from: file.size })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const submit = async () => {
    setError(null)
    if (body.trim() === '') {
      setError(t('letter.empty'))
      return
    }
    if (deliverOn <= todayLocal()) {
      setError(t('letter.pastDate'))
      return
    }
    try {
      await save.mutateAsync({
        body,
        deliverOn,
        audience,
        photo: photo
          ? { blob: photo.prepared.blob, extension: photo.prepared.extension }
          : null,
      })
      setSealed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /*
   * Подтверждение вместо закрытия.
   *
   * Письмо после отправки исчезает отовсюду, и без этого экрана человек
   * остался бы наедине с вопросом «сохранилось ли». Дата названа прямо -
   * по ней видно, что письмо ушло на тот день, который имели в виду,
   * а не на соседний.
   */
  if (sealed) {
    return (
      <Sheet open onClose={onClose} title={t('letter.sealedTitle')}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-float">
            <Check size={30} strokeWidth={2.6} aria-hidden />
          </span>
          <div>
            <p className="font-display text-lg font-bold">{t('letter.sealedHead')}</p>
            <p className="mt-1 text-sm text-muted">
              {t('letter.sealedBody', {
                day: day(deliverOn),
                who: audience === 'both' ? t('letter.sealedBoth') : '',
                photo: photo ? t('letter.sealedPhoto') : '',
              })}
            </p>
          </div>
          <Button onClick={onClose} className="w-full">
            {t('common.done')}
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title={t('letter.title')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{t('letter.what')}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            autoFocus
            placeholder={t('letter.placeholder')}
            className={`${INPUT_CLASS} min-w-0 resize-none`}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('letter.photo')}</span>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Сбрасываем значение: без этого повторный выбор ТОГО ЖЕ файла
              // не даёт события, и «заменить» молча ничего не делает
              e.target.value = ''
              if (file) void pick(file)
            }}
          />
          {photo ? (
            <div className="relative overflow-hidden rounded-2xl bg-raised">
              <img src={photo.url} alt="" className="max-h-56 w-full object-contain" />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(photo.url)
                  setPhoto(null)
                }}
                aria-label={t('letter.removePhoto')}
                className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full
                           bg-black/60 text-white backdrop-blur-sm"
              >
                <X size={18} aria-hidden />
              </button>
              <p className="px-3 py-2 text-[13px] text-muted tabular-nums">
                {formatBytes(photo.from)} → {formatBytes(photo.prepared.blob.size)}
              </p>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => input.current?.click()}
              className="self-start text-[15px]"
            >
              <ImagePlus size={18} aria-hidden className="text-muted" />
              {t('letter.attachPhoto')}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('letter.to')}</span>
          <Segmented
            value={audience}
            onChange={setAudience}
            ariaLabel={t('letter.to')}
            options={[
              { value: 'partner', label: t('letter.toPartner') },
              { value: 'both', label: t('letter.toBothChoice') },
            ]}
          />
        </div>

        <Field
          label={t('letter.when')}
          type="date"
          value={deliverOn}
          min={shiftDays(todayLocal(), 1)}
          onChange={(e) => setDeliverOn(e.target.value)}
          hint={t('letter.whenHint')}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={() => void submit()} loading={save.isPending}>
          {t('letter.seal')}
        </Button>
      </div>
    </Sheet>
  )
}
