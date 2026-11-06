import { useT } from '@/lib/i18n'
import type { Ref } from 'react'
import { Search, X } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
}

export function SearchInput({ value, onChange, placeholder, autoFocus, inputRef }: Props) {
  const t = useT()
  return (
    <div className="relative flex items-center">
      <Search size={17} strokeWidth={2.2} className="absolute left-2.5 text-muted" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // Поиск идёт локально по кэшу, поэтому автодополнение и автокоррекция
        // браузера только мешают - они правят запрос уже после фильтрации
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={placeholder}
        // Системное поле поиска: серая заливка без рамки, 40 пунктов
        className="min-h-10 w-full rounded-xl bg-raised py-1.5 pr-10 pl-9 text-[17px] outline-none
                   placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
          className="absolute right-0 flex size-10 items-center justify-center text-muted"
        >
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}
