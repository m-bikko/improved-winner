import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { useT } from '@/lib/i18n'
import { Button } from '@/ui/Button'
import { NumberField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { EMPTY_BODY, useLogWeight, type WeightPoint } from './api'

/** Пустое поле или число - ровно то же, что принимает NumberField. */
type Num = number | ''

/**
 * Взвешивание.
 *
 * Одно обязательное поле - вес. Всё остальное спрятано под раскрывашку
 * «С умных весов», и спрятано намеренно: у большинства взвешиваний этих
 * чисел не будет вовсе, а форма из семи полей там, где нужно ввести одно,
 * превращает ежедневное действие в заполнение анкеты.
 *
 * Раскрывашка открывается сама, если в этот день состав уже вводили: значит
 * человек взвешивается на умных весах, и прятать от него половину формы
 * бессмысленно.
 *
 * Проценты, а не килограммы, и это не упрощение. Прибор измеряет вес
 * и сопротивление; килограммы жира и мышц он сам считает из процентов.
 * Просить ввести и то и другое значило бы просить ввести одно число дважды
 * и дать им разойтись.
 */
export function WeighInSheet({
  userId,
  existing,
  onClose,
}: {
  userId: string
  /** Запись за сегодня, если уже есть: форма открывается заполненной. */
  existing: WeightPoint | null
  onClose: () => void
}) {
  const t = useT()
  const log = useLogWeight()

  const [weight, setWeight] = useState<Num>(existing?.weightKg ?? '')
  const [fat, setFat] = useState<Num>(existing?.bodyFatPct ?? '')
  const [muscle, setMuscle] = useState<Num>(existing?.musclePct ?? '')
  const [skeletal, setSkeletal] = useState<Num>(existing?.skeletalMusclePct ?? '')
  const [water, setWater] = useState<Num>(existing?.waterPct ?? '')
  const [visceral, setVisceral] = useState<Num>(existing?.visceral ?? '')
  const [bmr, setBmr] = useState<Num>(existing?.bmrKcal ?? '')
  const [open, setOpen] = useState(
    existing !== null && existing.bodyFatPct !== null,
  )
  const [error, setError] = useState<string | null>(null)

  const num = (v: Num): number | null => (v === '' ? null : v)

  // Границы те же, что в CHECK у таблицы: база всё равно не примет больше,
  // и лучше сказать об этом до отправки, чем показать текст ошибки Postgres.
  const bad = (v: Num, lo: number, hi: number): string | null =>
    v !== '' && (v < lo || v > hi) ? t('profile.expected', { lo, hi, unit: '' }).trim() : null

  const problems = {
    weight: bad(weight, 20, 400),
    fat: bad(fat, 2, 75),
    muscle: bad(muscle, 10, 95),
    skeletal: bad(skeletal, 5, 80),
    water: bad(water, 20, 85),
    visceral: bad(visceral, 1, 60),
    bmr: bad(bmr, 500, 5000),
  }

  // Скелетные мышцы - часть общей мышечной массы. Инвариант держит база;
  // форма обязана не предлагать того, что база отвергнет.
  const skeletalTooBig =
    skeletal !== '' && muscle !== '' && skeletal > muscle ? t('body.skeletalOver') : null
  const partsTooBig =
    fat !== '' && muscle !== '' && fat + muscle > 100 ? t('body.partsOver') : null

  const blocked =
    weight === '' ||
    Object.values(problems).some((p) => p !== null) ||
    skeletalTooBig !== null ||
    partsTooBig !== null

  const submit = async (): Promise<void> => {
    if (weight === '') return
    setError(null)
    try {
      await log.mutateAsync({
        userId,
        date: todayLocal(),
        weightKg: weight,
        ...EMPTY_BODY,
        bodyFatPct: num(fat),
        musclePct: num(muscle),
        skeletalMusclePct: num(skeletal),
        waterPct: num(water),
        visceral: num(visceral),
        bmrKcal: num(bmr),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('body.weighIn')}>
      <div className="flex flex-col gap-4">
        <NumberField
          label={t('profile.weight')}
          value={weight}
          onValueChange={setWeight}
          max={400}
          suffix={t('unit.kg')}
          invalid={problems.weight !== null}
          hint={problems.weight ?? undefined}
        />

        <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 bg-surface px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="text-sm font-medium">{t('body.smartScale')}</span>
              <span className="mt-0.5 block text-xs text-muted">{t('body.smartScaleHint')}</span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden
              className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>

          {open && (
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
              <NumberField
                label={t('body.fatPct')}
                value={fat}
                onValueChange={setFat}
                max={75}
                suffix="%"
                invalid={problems.fat !== null}
                hint={problems.fat ?? undefined}
              />
              <NumberField
                label={t('body.musclePct')}
                value={muscle}
                onValueChange={setMuscle}
                max={95}
                suffix="%"
                invalid={problems.muscle !== null || partsTooBig !== null}
                hint={problems.muscle ?? partsTooBig ?? undefined}
              />
              <NumberField
                label={t('body.skeletalPct')}
                value={skeletal}
                onValueChange={setSkeletal}
                max={80}
                suffix="%"
                invalid={problems.skeletal !== null || skeletalTooBig !== null}
                hint={problems.skeletal ?? skeletalTooBig ?? undefined}
              />
              <NumberField
                label={t('body.waterPct')}
                value={water}
                onValueChange={setWater}
                max={85}
                suffix="%"
                invalid={problems.water !== null}
                hint={problems.water ?? undefined}
              />
              <NumberField
                label={t('body.visceral')}
                value={visceral}
                onValueChange={setVisceral}
                max={60}
                invalid={problems.visceral !== null}
                hint={problems.visceral ?? t('body.visceralHint')}
              />
              <NumberField
                label={t('body.bmr')}
                value={bmr}
                onValueChange={setBmr}
                max={5000}
                suffix={t('unit.kcal')}
                invalid={problems.bmr !== null}
                hint={problems.bmr ?? undefined}
              />
              <p className="text-xs text-muted">{t('body.kgDerived')}</p>
            </div>
          )}
        </div>

        {error !== null && <p className="text-sm text-danger">{error}</p>}

        <Button disabled={blocked} loading={log.isPending} onClick={() => void submit()}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
