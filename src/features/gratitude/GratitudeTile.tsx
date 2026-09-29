import { useState } from 'react'
import { Heart, Trash2 } from 'lucide-react'
import { useUserId } from '@/auth/AuthProvider'
import { formatDayLabel, toLocalISO } from '@/lib/date'
import { useT } from '@/lib/i18n'
import { Card } from '@/ui/Card'
import { IconBadge } from '@/ui/IconBadge'
import { INPUT_CLASS } from '@/ui/Field'
import { useAddGratitude, useDeleteGratitude, useGratitudes } from './api'

/** Столько строк показываем; остальное - память, а не лента. */
const SHOWN = 5

/**
 * Благодарности: короткое «спасибо за…», которое видят оба.
 *
 * Половина подсказок в приложении сводится к «заметь и назови вслух».
 * Назвать вслух - действие, которое забывается ровно потому, что его негде
 * совершить: тема для этого слишком тяжёлая, а сообщение в мессенджере тонет
 * среди бытового.
 *
 * Поэтому здесь одно поле и одна кнопка. Ни оценок, ни категорий, ни ответов:
 * всё это превратило бы благодарность в отчётность, а отчётность - последнее,
 * чем стоит заниматься в этом месте.
 *
 * Своё удаляется, чужое только читается - это держит база. Сказанное вслух
 * не должно зависеть от настроения того, кому сказали.
 */
export function GratitudeTile({ partnerName }: { partnerName: string }) {
  const t = useT()
  const userId = useUserId()
  const list = useGratitudes()
  const add = useAddGratitude()
  const remove = useDeleteGratitude()

  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  const items = list.data ?? []
  const ready = text.trim() !== ''

  const submit = async (): Promise<void> => {
    if (!ready) return
    await add.mutateAsync(text)
    setText('')
    setOpen(false)
  }

  return (
    <Card as="section" className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold">
          <IconBadge icon={Heart} tone="rose" size="sm" />
          {t('thanks.title')}
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-semibold
                       text-accent-soft-ink transition-transform active:scale-95"
          >
            {t('thanks.add')}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
            maxLength={500}
            placeholder={t('thanks.placeholder', { name: partnerName })}
            className={`${INPUT_CLASS} min-w-0 resize-none`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!ready || add.isPending}
              onClick={() => void submit()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink
                         transition-transform active:scale-95 disabled:opacity-50"
            >
              {t('thanks.send')}
            </button>
            <button
              type="button"
              onClick={() => {
                setText('')
                setOpen(false)
              }}
              className="px-3 py-2.5 text-sm font-medium text-muted"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        !open && <p className="mt-2 text-sm text-muted">{t('thanks.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.slice(0, SHOWN).map((g) => {
            const mine = g.authorId === userId
            return (
              <li key={g.id} className="flex items-start gap-2 rounded-2xl bg-raised/60 px-3.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{g.body}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {mine ? t('thanks.fromMe') : partnerName}
                    {' · '}
                    {formatDayLabel(toLocalISO(new Date(g.createdAt))).toLowerCase()}
                  </span>
                </span>
                {mine && (
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    disabled={remove.isPending}
                    onClick={() => void remove.mutateAsync(g.id)}
                    className="-mr-1.5 shrink-0 p-1.5 text-muted"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
