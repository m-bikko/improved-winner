import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, FileText } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { APP_NAME } from '@/lib/appName'
import { todayLocal } from '@/lib/date'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { EmptyState, Loading } from '@/ui/States'
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
      <div className="mx-auto max-w-2xl px-4 pt-1">
        <EmptyState
          icon={FileText}
          tone="plum"
          title={t('rep.nothing')}
          action={
            <Link
              to="/cycle"
              className="mt-1 flex min-h-12 items-center justify-center rounded-2xl bg-accent-soft px-5
                         font-semibold text-accent-soft-ink transition-transform active:scale-[0.97]"
            >
              {t('rep.toCycle')}
            </Link>
          }
        />
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
    // Ссылки «В раздел цикла» наверху больше нет: назад ведёт кнопка в шапке,
    // и две стрелки назад на одном экране спорили бы, какая из них настоящая
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <p className="px-1 text-[15px] leading-relaxed text-muted">
        {t('rep.intro')}
      </p>

      {/* pre, а не набор блоков: текст на экране и текст в буфере должны
          совпадать дословно, иначе врач и приложение увидят разное.
          Шрифт при этом обычный, не моноширинный: выравнивания колонками
          в тексте нет, а читать выписку моноширинным мелким тяжело */}
      <Card as="div" className="px-5 py-4">
        <pre className="overflow-x-auto font-sans text-[15px] leading-relaxed whitespace-pre-wrap">
          {text}
        </pre>
      </Card>

      {/* Кнопка прилипает к низу: выписка длинная, и искать «Скопировать»
          под полной историей циклов - лишний путь для единственного
          действия экрана */}
      <div className="sticky bottom-above-tabbar z-20">
        <Button className="w-full" onClick={() => void copy()}>
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? t('cycle.copied') : t('cycle.copy')}
        </Button>
      </div>
    </div>
  )
}
