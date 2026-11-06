import { createPortal } from 'react-dom'
import { Plus, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { SPRING } from './motion'

const CLASS =
  'fixed right-4 bottom-above-tabbar z-30 flex h-14 items-center justify-center gap-2 ' +
  'rounded-full bg-accent text-accent-ink shadow-float active:opacity-80'

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
 *
 * Порталом в body: при смене экрана его обёртка едет с `transform`, и `fixed` внутри
 * неё считался бы от обёртки, то есть кнопка уезжала бы на время перехода.
 */
export function Fab(props: Common & ({ onClick: () => void } | { to: string })) {
  const { label, icon: Icon = Plus, extended = false } = props
  const body = (
    <>
      <Icon size={26} strokeWidth={2.2} aria-hidden />
      {extended && <span className="pr-1 text-base font-semibold">{label}</span>}
    </>
  )
  const shape = extended ? 'px-5' : 'w-14'

  if ('to' in props) {
    return createPortal(
      <MotionLink
        to={props.to}
        aria-label={extended ? undefined : label}
        whileTap={{ scale: 0.92 }}
        transition={SPRING}
        className={`${CLASS} ${shape}`}
      >
        {body}
      </MotionLink>,
      document.body,
    )
  }
  return createPortal(
    <motion.button
      type="button"
      onClick={props.onClick}
      aria-label={extended ? undefined : label}
      whileTap={{ scale: 0.92 }}
      transition={SPRING}
      className={`${CLASS} ${shape}`}
    >
      {body}
    </motion.button>,
    document.body,
  )
}
