import { useState } from 'react'

/**
 * Картинка, которая не мигает пустотой.
 *
 * Под ней сразу лежит заглушка - крошечный снимок из строки базы, растянутый
 * и размытый: место и цвет видны до первого байта из сети. Настоящая картинка
 * проявляется поверх, когда загрузилась. Ленивая загрузка и асинхронное
 * декодирование: лента из сотни снимков качает только то, что на экране,
 * и не подвисает при прокрутке.
 *
 * Размытие - статичное `filter: blur` у неподвижного слоя: рисуется один раз,
 * анимации на нём нет, и батарею оно не ест.
 */
export function ProgressiveImage({
  src,
  placeholder,
  alt,
  className = '',
  fit = 'cover',
}: {
  src: string | undefined
  placeholder: string
  alt: string
  className?: string
  fit?: 'cover' | 'contain'
}) {
  const [loaded, setLoaded] = useState<string | null>(null)
  const ready = src !== undefined && loaded === src
  const objectFit = fit === 'cover' ? 'object-cover' : 'object-contain'

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {!ready && (
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className={`absolute inset-0 size-full scale-110 blur-xl ${objectFit}`}
        />
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(src)}
          className={`absolute inset-0 size-full transition-opacity duration-500 ${objectFit} ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </span>
  )
}
