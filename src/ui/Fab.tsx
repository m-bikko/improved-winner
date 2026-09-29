import { Plus, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { SPRING } from './motion'

const CLASS =
  'fixed right-4 bottom-above-tabbar z-30 flex h-14 items-center justify-center gap-2 ' +
  'rounded-2xl bg-accent text-accent-ink shadow-float'

const MotionLink = motion.create(Link)

type Common = {
  /** Подпись для скринридера и, если `extended`, на самой кнопке. */
  label: string
  icon?: LucideIcon
  /** Кнопка с текстом, а не круглая иконка. */
  extended?: boolean
}

/**
 * Плавающая кнопка создания.
 *
 * Стоит над панелью вкладок, а не у самого края: раньше все шесть копий
 * были прибиты к `bottom-6`, и с панелью внизу они оказались бы под ней.
 * Высоту панели знает только CSS-переменная, поэтому позицию задаёт
 * утилита `bottom-above-tabbar`, а не число здесь.
 */
export function Fab(props: Common & ({ onClick: () => void } | { to: string })) {
  const { label, icon: Icon = Plus, extended = false } = props
  const body = (
    <>
      <Icon size={24} strokeWidth={2.4} aria-hidden />
      {extended && <span className="pr-1 text-base font-semibold">{label}</span>}
    </>
  )
  const shape = extended ? 'px-5' : 'w-14'

  if ('to' in props) {
    return (
      <MotionLink
        to={props.to}
        aria-label={extended ? undefined : label}
        whileTap={{ scale: 0.92 }}
        transition={SPRING}
        className={`${CLASS} ${shape}`}
      >
        {body}
      </MotionLink>
    )
  }
  return (
    <motion.button
      type="button"
      onClick={props.onClick}
      aria-label={extended ? undefined : label}
      whileTap={{ scale: 0.92 }}
      transition={SPRING}
      className={`${CLASS} ${shape}`}
    >
      {body}
    </motion.button>
  )
}
