import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Slot = { action: ReactNode; setAction: (node: ReactNode) => void }

const HeaderActionContext = createContext<Slot | null>(null)

/**
 * Слот справа в шапке под кнопку текущего экрана.
 *
 * Через контекст, а не через портал: портал требует, чтобы целевой узел уже
 * существовал на первом рендере, а шапка и содержимое рисуются в одном
 * проходе - кнопка мигала бы при каждом переходе.
 */
export function HeaderActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ReactNode>(null)
  const value = useMemo(() => ({ action, setAction }), [action])
  return <HeaderActionContext value={value}>{children}</HeaderActionContext>
}

export function useHeaderActionSlot(): ReactNode {
  return use(HeaderActionContext)?.action ?? null
}

/**
 * Ставит кнопку в шапку на время жизни экрана и убирает её при уходе.
 *
 * `node` должен быть стабильным (useMemo в вызывающем компоненте), иначе
 * эффект будет переустанавливать слот на каждом рендере.
 */
export function useHeaderAction(node: ReactNode): void {
  const slot = use(HeaderActionContext)
  useEffect(() => {
    slot?.setAction(node)
    return () => slot?.setAction(null)
    // slot стабилен по set-функции; следим за самим узлом
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])
}
