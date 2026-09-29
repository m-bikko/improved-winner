import { useT } from '@/lib/i18n'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { trim } from '@/features/foods/FoodsPage'
import type { DiaryEntry, Meal } from './types'

/**
 * Строка дневника, которую можно перетащить.
 *
 * Ручка отдельной кнопкой, а не перетаскивание за всю строку. На телефоне тап
 * по строке уже открывает редактирование, и без выделенной ручки пришлось бы
 * различать «нажал, чтобы поправить» и «нажал, чтобы потащить» по длительности
 * удержания - то есть каждый раз ждать, прежде чем экран отреагирует.
 */
export function DraggableEntry({
  entry,
  onOpen,
}: {
  entry: DiaryEntry
  onOpen: () => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Разделитель от текста, а не от края - как в сгруппированных списках
      className={`relative flex items-center bg-surface before:absolute before:inset-x-4 before:top-0
                  before:h-px before:bg-line ${
                    isDragging ? 'z-10 rounded-2xl opacity-95 shadow-float before:hidden' : ''
                  }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left
                   transition-colors active:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{entry.name}</span>
          <span className="text-[13px] text-muted">
            {entry.servingLabel ? `${entry.servingLabel} · ` : ''}
            {trim(entry.grams)} {t('unit.gram')}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {Math.round(entry.kcal)} <span className="font-normal text-muted">{t('unit.kcal')}</span>
        </span>
      </button>

      <button
        type="button"
        aria-label={t('diary.drag', { name: entry.name })}
        // touch-none обязателен: без него браузер считает жест прокруткой
        // и забирает его себе, так и не отдав библиотеке
        className="shrink-0 cursor-grab touch-none px-3 py-4 text-muted/60 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden />
      </button>
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

  return (
    <div ref={setNodeRef} className={isOver ? 'bg-raised/60' : undefined}>
      {children}
      {isEmpty && (
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
