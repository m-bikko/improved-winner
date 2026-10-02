/**
 * Медленное сияние из трёх цветных пятен - фон «героя» экрана.
 *
 * Тот же приём, что у приветствия на главной: пятна дрейфуют только
 * transform'ом градиентов, без blur-фильтра, - анимацию ведёт композитор,
 * батарею она не ест. Родителю нужны `relative isolate overflow-hidden`.
 * При «уменьшить движение» пятна стоят на месте (см. index.css).
 */
export function Aurora({ colors }: { colors: readonly [string, string, string] }) {
  return (
    <div aria-hidden className="aurora">
      {colors.map((c, i) => (
        <span key={i} style={{ background: `radial-gradient(closest-side, ${c}, transparent)` }} />
      ))}
    </div>
  )
}
