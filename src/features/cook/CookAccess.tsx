import { useState } from 'react'
import { Check, ChefHat, Copy, Share2, ShieldOff } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDayLabel, formatTime, toLocalISO } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { useCookStatus, useIssueCookLink, useRevokeCookLink } from './api'

function when(ts: string): string {
  const d = new Date(ts)
  return `${formatDayLabel(toLocalISO(d))}, ${formatTime(d)}`
}

/**
 * Доступ повара - в профиле владельца.
 *
 * Ссылка показывается один раз, сразу после выпуска: в базе только хеш,
 * и показать её снова нечем. Потеряли - выпускаем новую, старая и все её
 * сессии перестают работать. Отзыв закрывает доступ сразу.
 *
 * Карточку видит только владелец повара: второму база состояния не отдаёт.
 */
export function CookAccess() {
  const t = useT()
  const status = useCookStatus()
  const issue = useIssueCookLink()
  const revoke = useRevokeCookLink()
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!status.data) return null
  const s = status.data
  const active = s.issuedAt !== null && s.revokedAt === null

  const create = () => {
    setError(null)
    setCopied(false)
    issue.mutate(undefined, { onSuccess: setLink, onError: (e) => setError(e.message) })
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError(t('cook.copyFailed'))
    }
  }

  const share = async () => {
    if (!link || !navigator.share) return
    try {
      await navigator.share({ title: t('cook.shareTitle'), url: link })
    } catch {
      /* человек закрыл окно «Поделиться» - это не ошибка */
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="flex items-center gap-2.5 text-[15px] font-semibold">
        <IconBadge icon={ChefHat} tone="amber" size="sm" />
        {t('cook.accessTitle')}
      </p>
      <p className="text-[13px] text-muted">{t('cook.accessAbout')}</p>

      <p className="text-sm">
        {active && s.issuedAt
          ? t('cook.issuedAt', { when: when(s.issuedAt) })
          : s.revokedAt
            ? t('cook.revokedAt', { when: when(s.revokedAt) })
            : t('cook.noLink')}
        {active && (
          <span className="block text-[13px] text-muted">
            {s.lastSignInAt && s.issuedAt && s.lastSignInAt >= s.issuedAt ? t('cook.lastSeen', { when: when(s.lastSignInAt) }) : t('cook.neverSeen')}
          </span>
        )}
      </p>

      {link && (
        <div className="flex flex-col gap-2 rounded-2xl bg-raised p-3">
          <p className="font-mono text-[13px] break-all select-all">{link}</p>
          <div className="flex gap-2">
            <Button variant="soft" className="min-h-11 flex-1 text-[15px]" onClick={() => void copy()}>
              {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
              {copied ? t('cook.copied') : t('cook.copy')}
            </Button>
            {typeof navigator.share === 'function' && (
              <Button variant="soft" className="min-h-11 flex-1 text-[15px]" onClick={() => void share()}>
                <Share2 size={17} aria-hidden />
                {t('cook.share')}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-muted">{t('cook.once')}</p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button variant={active ? 'secondary' : 'primary'} loading={issue.isPending} onClick={create}>
          {active ? t('cook.newLink') : t('cook.createLink')}
        </Button>
        {active && <p className="text-[12px] text-muted">{t('cook.newLinkHint')}</p>}
        {active && (
          <Button
            variant="danger"
            loading={revoke.isPending}
            onClick={() =>
              revoke.mutate(undefined, {
                onSuccess: () => setLink(null),
                onError: (e) => setError(e.message),
              })
            }
          >
            <ShieldOff size={17} aria-hidden />
            {t('cook.revoke')}
          </Button>
        )}
      </div>
    </Card>
  )
}
