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
      className={`flex items-center border-t border-line bg-surface ${
        isDragging ? 'relative z-10 opacity-90 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{entry.name}</span>
          <span className="text-xs text-muted">
            {entry.servingLabel ? `${entry.servingLabel} · ` : ''}
            {trim(entry.grams)} {t('unit.gram')}
          </span>
        </span>
        <span className="shrink-0 text-sm text-muted">
          {Math.round(entry.kcal)} {t('unit.kcal')}
        </span>
      </button>

      <button
        type="button"
        aria-label={t('diary.drag', { name: entry.name })}
        // touch-none обязателен: без него браузер считает жест прокруткой
        // и забирает его себе, так и не отдав библиотеке
        className="shrink-0 cursor-grab touch-none px-3 py-4 text-muted active:cursor-grabbing"
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
          className={`border-t border-dashed px-4 py-3 text-center text-xs transition-colors ${
            isOver ? 'border-accent text-accent' : 'border-line text-muted'
          }`}
        >
          {t(isOver ? 'diary.dropHere' : 'common.nothingYet')}
        </p>
      )}
    </div>
  )
}
