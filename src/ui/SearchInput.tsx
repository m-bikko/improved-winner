import { useT } from '@/lib/i18n'
import { Search, X } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function SearchInput({ value, onChange, placeholder, autoFocus }: Props) {
  const t = useT()
  return (
    <div className="relative flex items-center">
      <Search size={18} className="absolute left-3.5 text-muted" aria-hidden />
      <input
        type="search"
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
        className="w-full rounded-xl bg-surface py-3 pr-10 pl-11 ring-1 ring-line outline-none
                   focus:ring-2 focus:ring-accent placeholder:text-muted
                   [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
          className="absolute right-2 p-2 text-muted"
        >
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}
