import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronLeft, Copy } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { APP_NAME } from '@/lib/appName'
import { todayLocal } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Loading } from '@/ui/States'
import { useCycleSettings, usePeriods } from './api'
import { warnings } from './cycle'
import { buildReport, reportToText } from './report'

/**
 * Выписка для врача.
 *
 * Только свой цикл: выписку несут на приём, и делать её из чужих записей
 * незачем - а вопрос доступа к ним и без того решён в разделе.
 *
 * Текстом, а не таблицей: он переживает вставку куда угодно - в сообщение,
 * в заметку, в печать. Врачу нужно содержимое, а не вид.
 */
export function CycleReportPage() {
  const t = useT()
  const userId = useUserId()
  const settings = useCycleSettings()
  const periods = usePeriods(userId)
  const [copied, setCopied] = useState(false)

  if (settings.isPending || periods.isPending) return <Loading />

  const today = todayLocal()
  const report = buildReport(periods.data ?? [], today)

  if (!settings.data?.trackingEnabled || !report) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-muted">
          {t('rep.nothing')}
        </p>
        <Link to="/cycle" className="mt-3 inline-block text-accent underline">
          {t('rep.toCycle')}
        </Link>
      </div>
    )
  }

  const titles = warnings(periods.data ?? [], today).map((w) => w.title)
  const text = reportToText(report, titles, APP_NAME)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Буфер может быть закрыт настройками - текст всё равно виден
      // и выделяется руками
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-10">
      <Link to="/cycle" className="-ml-2 inline-flex items-center gap-1 p-2 text-sm text-muted">
        <ChevronLeft size={18} aria-hidden />
        {t('rep.toCycle')}
      </Link>

      <p className="mt-2 text-sm text-muted">
        {t('rep.intro')}
      </p>

      {/* pre, а не набор блоков: текст на экране и текст в буфере должны
          совпадать дословно, иначе врач и приложение увидят разное */}
      <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface p-4 text-xs leading-relaxed whitespace-pre-wrap ring-1 ring-line">
        {text}
      </pre>

      <div className="mt-4">
        <Button onClick={() => void copy()}>
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? t('cycle.copied') : t('cycle.copy')}
        </Button>
      </div>
    </div>
  )
}
