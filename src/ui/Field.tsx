import { useEffect, useId, useState, type InputHTMLAttributes } from 'react'

type BaseProps = {
  label: string
  hint?: string | undefined
  suffix?: string | undefined
  /** Подпись остаётся для скринридера, но не занимает места в макете. */
  hideLabel?: boolean | undefined
}

// Поле заливкой, а не рамкой: на карточке без рамок обведённое поле
// выглядело бы чужим. Граница появляется при фокусе - там она и нужна
export const INPUT_CLASS =
  'w-full rounded-2xl bg-raised px-4 py-3 ring-1 ring-transparent outline-none ' +
  'transition-shadow focus:bg-surface focus:ring-2 focus:ring-accent placeholder:text-muted/80'

export function Field({
  label,
  hint,
  suffix,
  hideLabel,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={hideLabel ? 'sr-only' : 'text-sm text-muted'}>{label}</span>
      <span className="relative flex items-center">
        <input id={id} className={`${INPUT_CLASS} ${suffix ? 'pr-12' : ''}`} {...rest} />
        {suffix && <span className="absolute right-4 text-sm text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

type NumberProps = BaseProps & {
  value: number | ''
  onValueChange: (value: number | '') => void
  /**
   * Верхняя граница. Проверяется прямо при вводе - набрать её «по пути» нельзя,
   * потому что число растёт слева направо.
   *
   * Нижней границы здесь намеренно нет: проверять её при вводе - значит
   * запретить ввод вовсе. У года рождения минимум 1900, и первая же набранная
   * цифра «2» его не проходит. Диапазон снизу проверяет форма перед сохранением.
   */
  max?: number | undefined
  placeholder?: string | undefined
  invalid?: boolean | undefined
  autoFocus?: boolean | undefined
}

/**
 * Числовое поле для граммов и КБЖУ.
 *
 * inputMode="decimal" вместо type="number": на телефоне даёт цифровую
 * клавиатуру, но не тащит за собой спиннеры, скролл-колесом-меняется-значение
 * и валидацию браузера, которая на дробных с запятой ведёт себя по-разному.
 *
 * Запятая принимается наравне с точкой - на русской раскладке её набирают чаще.
 */
export function NumberField({
  label,
  hint,
  suffix,
  hideLabel,
  value,
  onValueChange,
  max,
  placeholder,
  invalid,
  autoFocus,
}: NumberProps) {
  const id = useId()

  // Набранный текст живёт отдельно от числа. Иначе промежуточные состояния
  // теряются: «98.» это Number 98, поле перерисовалось бы как «98», и точку
  // было бы не набрать - то есть дробный вес ввести нельзя.
  const [text, setText] = useState(() => (value === '' ? '' : String(value)))

  // Синхронизация, когда значение меняют снаружи (пришли данные, сбросили
  // форму). Сравниваем по числу, а не по строке, чтобы не затирать «98.»
  // на «98», пока человек печатает.
  useEffect(() => {
    const parsed = text === '' ? '' : Number(text)
    if (parsed !== value) setText(value === '' ? '' : String(value))
    // text намеренно вне зависимостей: эффект реагирует на внешнее значение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className={hideLabel ? 'sr-only' : 'text-sm text-muted'}>{label}</span>
      <span className="relative flex items-center">
        <input
          id={id}
          inputMode="decimal"
          enterKeyHint="done"
          autoFocus={autoFocus}
          onFocus={(e) => e.currentTarget.select()}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            // Запятая наравне с точкой: на русской раскладке её набирают чаще
            const raw = e.target.value.replace(',', '.').trim()
            if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
            if (raw !== '' && max !== undefined && Number(raw) > max) return
            setText(raw)
            onValueChange(raw === '' || raw === '.' ? '' : Number(raw))
          }}
          className={`${INPUT_CLASS} ${suffix ? 'pr-12' : ''} ${
            invalid ? 'ring-2 ring-danger' : ''
          }`}
        />
        {suffix && <span className="absolute right-4 text-sm text-muted">{suffix}</span>}
      </span>
      {hint && <span className={`text-xs ${invalid ? 'text-danger' : 'text-muted'}`}>{hint}</span>}
    </label>
  )
}
