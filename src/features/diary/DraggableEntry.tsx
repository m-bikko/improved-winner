import { useT } from '@/lib/i18n'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChefHat } from 'lucide-react'
import { trim } from '@/features/foods/FoodsPage'
import { SwipeRow } from '@/ui/SwipeRow'
import type { DiaryEntry, Meal } from './types'

/**
 * Строка дневника. Нажатие - поправить, смахнуть влево - удалить,
 * удержать - перенести.
 *
 * Постоянная ручка в каждой строке занимала место и шумела ради действия,
 * которое нужно редко. Нажатие от удержания ждать не заставляет: оно срабатывает
 * при отпускании как обычно, а удержание включается само, если палец не двигался.
 */
export function DraggableEntry({
  entry,
  onOpen,
  onDelete,
}: {
  entry: DiaryEntry
  onOpen: () => void
  onDelete: () => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Разделитель от текста, а не от края - как в сгруппированных списках.
      // z-[1]: иначе красная подложка смахивания перекрыла бы линию
      className={`relative bg-surface after:absolute after:inset-x-4 after:top-0 after:z-[1]
                  after:h-px after:origin-top after:scale-y-50 after:bg-line ${
                    isDragging ? 'z-10 scale-[1.02] overflow-hidden rounded-2xl shadow-float after:hidden' : ''
                  }`}
      {...listeners}
      aria-roledescription={attributes['aria-roledescription']}
    >
      <SwipeRow onDelete={onDelete} label={t('common.delete')} disabled={isDragging}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left
                   transition-colors duration-150 active:bg-raised active:duration-0"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base">{entry.name}</span>
          <span className="flex items-center gap-1 text-[13px] text-muted">
            {/* Внёс повар - видно сразу, чтобы не гадать, откуда тарелка */}
            {entry.createdBy !== null && entry.createdBy !== entry.userId && (
              <ChefHat size={13} aria-label={t('diary.byCook')} className="shrink-0 text-tone-amber" />
            )}
            <span>
              {entry.servingLabel ? `${entry.servingLabel} · ` : ''}
              {trim(entry.grams)} {t('unit.gram')}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {Math.round(entry.kcal)} <span className="text-[13px] font-normal text-muted">{t('unit.kcal')}</span>
        </span>
      </button>
      </SwipeRow>
    </div>
  )
}

/**
 * Зона приёма пищи.
 *
 * Отдельный droppable нужен ради пустых секций: если в приёме нет ни одной
 * записи, ронять там не на что, и перенести туда еду было бы нельзя.
 */
export function MealDropZone({
  meal,
  children,
  isEmpty,
}: {
  meal: Meal
  children: React.ReactNode
  isEmpty: boolean
}) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: meal })
  // Подсказка - только пока что-то несут: четыре пустые рамки днём съедали экран,
  // а о том, что сюда можно уронить, надо знать лишь в момент переноса
  const { active } = useDndContext()

  return (
    <div ref={setNodeRef} className={isOver ? 'bg-raised/60' : undefined}>
      {children}
      {isEmpty && active && (
        <p
          className={`mx-4 mb-1 rounded-2xl border border-dashed px-4 py-3 text-center text-[13px] transition-colors ${
            isOver ? 'border-accent text-accent' : 'border-line text-muted'
          }`}
        >
          {t(isOver ? 'diary.dropHere' : 'common.nothingYet')}
        </p>
      )}
    </div>
  )
}
