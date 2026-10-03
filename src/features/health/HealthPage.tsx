import { useState } from 'react'
import { Check, Droplet, HeartPulse, Phone, Pill, Plus, Stethoscope, Trash2, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { shiftDays, todayLocal } from '@/lib/date'
import { usePair, type Pair } from '@/features/profile/pair'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Card, SectionTitle } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { Field, INPUT_CLASS } from '@/ui/Field'
import { IconBadge } from '@/ui/IconBadge'
import { Segmented } from '@/ui/Segmented'
import { Sheet } from '@/ui/Sheet'
import { ErrorState, Loading } from '@/ui/States'
import {
  BLOOD_TYPES,
  activeOn,
  doseKey,
  useDeleteDoctor,
  useDeleteMed,
  useHealth,
  useSaveCard,
  useSaveDoctor,
  useSaveMed,
  useToggleDose,
  type Doctor,
  type HealthCard,
  type Medication,
} from './api'

/**
 * Здоровье и аптечка.
 *
 * Карточка на каждого (группа крови, аллергии, состояния, кому звонить),
 * лекарства с расписанием - отметка приёма видна второму, - и врачи
 * с телефонами. Видят оба: при беременности и в приёмном покое второй
 * знает, что сказать врачу.
 */
export function HealthPage() {
  const t = useT()
  const pair = usePair()
  const today = todayLocal()
  const since = shiftDays(today, -14)
  const health = useHealth(since)
  const [editingCard, setEditingCard] = useState(false)
  const [med, setMed] = useState<Medication | 'new' | null>(null)
  const [doctor, setDoctor] = useState<Doctor | 'new' | null>(null)

  if (health.isError) return <ErrorState error={health.error} onRetry={() => void health.refetch()} />
  if (health.isPending || pair.isPending) return <Loading />

  const h = health.data
  const card = (id: string) => h.cards.find((c) => c.userId === id)
  const people = [pair.userId, pair.partnerId].filter((id) => id !== '')

  return (
    <div className="stagger mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-1">
      <SectionTitle
        action={
          <button type="button" onClick={() => setMed('new')} className="flex items-center gap-1 text-sm font-semibold text-accent">
            <Plus size={16} aria-hidden />
            {t('hl.addMed')}
          </button>
        }
      >
        {t('hl.today')}
      </SectionTitle>
      {people.map((id) => (
        <Meds
          key={id}
          person={id}
          pair={pair}
          meds={h.meds.filter((m) => m.userId === id && activeOn(m, today))}
          doses={h.doses}
          today={today}
          since={since}
          onOpen={(m) => setMed(m)}
        />
      ))}

      <SectionTitle className="mt-3">{t('hl.cards')}</SectionTitle>
      {people.map((id) => (
        <PersonCard key={id} person={id} pair={pair} card={card(id)} onEdit={id === pair.userId ? () => setEditingCard(true) : undefined} />
      ))}

      <SectionTitle
        className="mt-3"
        action={
          <button type="button" onClick={() => setDoctor('new')} className="flex items-center gap-1 text-sm font-semibold text-accent">
            <Plus size={16} aria-hidden />
            {t('common.add')}
          </button>
        }
      >
        {t('hl.doctors')}
      </SectionTitle>
      {h.doctors.length === 0 ? (
        <Card className="p-4 text-sm text-muted">{t('hl.noDoctors')}</Card>
      ) : (
        <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-line">
          {h.doctors.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => setDoctor(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                {d.personId ? (
                  <Avatar name={pair.nameOf(d.personId)} tone={pair.toneOf(d.personId)} size="sm" />
                ) : (
                  <IconBadge icon={Stethoscope} tone="teal" size="sm" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.name}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {[d.specialty, d.place].filter(Boolean).join(' · ') || (d.personId ? pair.nameOf(d.personId) : t('hl.shared'))}
                  </span>
                </span>
              </button>
              {d.phone && (
                <a
                  href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}
                  aria-label={t('hl.call', { name: d.name })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tone-green-soft text-tone-green active:scale-95"
                >
                  <Phone size={18} aria-hidden />
                </a>
              )}
            </div>
          ))}
        </Card>
      )}

      <p className="mt-2 px-2 text-center text-[12px] text-muted">{t('hl.disclaimer')}</p>

      {editingCard && <CardSheet card={card(pair.userId)} userId={pair.userId} onClose={() => setEditingCard(false)} />}
      {med && <MedSheet med={med === 'new' ? null : med} today={today} onClose={() => setMed(null)} />}
      {doctor && <DoctorSheet doctor={doctor === 'new' ? null : doctor} pair={pair} onClose={() => setDoctor(null)} />}
    </div>
  )
}

/**
 * Лекарства человека на сегодня: время - кружком, принятое - с галочкой.
 * Свои отмечаются тапом, у второго видно, принято ли.
 */
function Meds({
  person,
  pair,
  meds,
  doses,
  today,
  since,
  onOpen,
}: {
  person: string
  pair: Pair
  meds: Medication[]
  doses: string[]
  today: string
  since: string
  onOpen: (m: Medication) => void
}) {
  const t = useT()
  const toggle = useToggleDose(since)
  const own = person === pair.userId
  if (meds.length === 0 && !own) return null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Avatar name={pair.nameOf(person)} tone={pair.toneOf(person)} size="sm" />
        <span className="font-semibold">{pair.nameOf(person)}</span>
      </div>
      {meds.length === 0 ? (
        <p className="text-sm text-muted">{t('hl.noMeds')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {meds.map((m) => (
            <li key={m.id} className="flex items-start gap-3">
              <IconBadge icon={Pill} tone="teal" size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => own && onOpen(m)} disabled={!own} className="text-left">
                  <span className="block font-semibold">{m.name}</span>
                  {m.dose && <span className="block text-[13px] text-muted">{m.dose}</span>}
                </button>
                {m.times.length === 0 ? (
                  <p className="mt-1 text-[13px] text-muted">{t('hl.asNeeded')}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.times.map((slot) => {
                      const taken = doses.includes(doseKey(m.id, today, slot))
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={!own}
                          onClick={() => toggle.mutate({ medId: m.id, day: today, slot, taken: !taken })}
                          aria-pressed={taken}
                          className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums transition-colors ${
                            taken ? 'bg-tone-green text-white' : 'bg-raised text-ink'
                          } ${own ? 'active:scale-95' : ''}`}
                        >
                          {taken && <Check size={14} strokeWidth={3} aria-hidden />}
                          {slot}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function PersonCard({ person, pair, card, onEdit }: { person: string; pair: Pair; card: HealthCard | undefined; onEdit?: (() => void) | undefined }) {
  const t = useT()
  const line = (label: string, value: string | null) =>
    value ? (
      <div>
        <p className="text-[12px] font-semibold text-muted">{label}</p>
        <p className="text-[15px] whitespace-pre-line">{value}</p>
      </div>
    ) : null
  const empty = !card || (!card.bloodType && !card.allergies && !card.conditions && !card.emergency && !card.notes)
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={pair.nameOf(person)} tone={pair.toneOf(person)} size="md" />
        <p className="min-w-0 flex-1 font-display text-lg font-extrabold">{pair.nameOf(person)}</p>
        {card?.bloodType && (
          <span className="flex items-center gap-1 rounded-full bg-tone-rose-soft px-3 py-1 font-display font-extrabold text-tone-rose">
            <Droplet size={14} aria-hidden className="fill-current" />
            {card.bloodType}
          </span>
        )}
      </div>
      {empty ? (
        <p className="mt-3 text-sm text-muted">{onEdit ? t('hl.cardEmptyMine') : t('hl.cardEmpty')}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {line(t('hl.allergies'), card.allergies)}
          {line(t('hl.conditions'), card.conditions)}
          {line(t('hl.emergency'), card.emergency)}
          {line(t('hl.notes'), card.notes)}
        </div>
      )}
      {onEdit && (
        <Button variant="soft" className="mt-3 w-full" onClick={onEdit}>
          <HeartPulse size={17} aria-hidden />
          {empty ? t('hl.fill') : t('common.edit')}
        </Button>
      )}
    </Card>
  )
}

function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={500} placeholder={placeholder} className={`${INPUT_CLASS} resize-none py-3`} />
    </label>
  )
}

function CardSheet({ card, userId, onClose }: { card: HealthCard | undefined; userId: string; onClose: () => void }) {
  const t = useT()
  const save = useSaveCard()
  const [blood, setBlood] = useState<string | null>(card?.bloodType ?? null)
  const [allergies, setAllergies] = useState(card?.allergies ?? '')
  const [conditions, setConditions] = useState(card?.conditions ?? '')
  const [emergency, setEmergency] = useState(card?.emergency ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={t('hl.myCard')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('hl.bloodType')}</span>
          <div className="grid grid-cols-4 gap-2">
            {BLOOD_TYPES.map((b) => (
              <Chip key={b} selected={blood === b} onClick={() => setBlood(blood === b ? null : b)}>
                {b}
              </Chip>
            ))}
          </div>
        </div>
        <Area label={t('hl.allergies')} value={allergies} onChange={setAllergies} placeholder={t('hl.allergiesHint')} />
        <Area label={t('hl.conditions')} value={conditions} onChange={setConditions} />
        <Field label={t('hl.emergency')} value={emergency} onChange={(e) => setEmergency(e.target.value)} maxLength={200} placeholder={t('hl.emergencyHint')} />
        <Area label={t('hl.notes')} value={notes} onChange={setNotes} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={save.isPending}
          onClick={() => save.mutate({ userId, bloodType: blood, allergies, conditions, emergency, notes }, { onSuccess: onClose, onError: (e) => setError(e.message) })}
        >
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}

function MedSheet({ med, today, onClose }: { med: Medication | null; today: string; onClose: () => void }) {
  const t = useT()
  const save = useSaveMed()
  const remove = useDeleteMed()
  const [name, setName] = useState(med?.name ?? '')
  const [dose, setDose] = useState(med?.dose ?? '')
  const [times, setTimes] = useState<string[]>(med?.times ?? ['09:00'])
  const [draft, setDraft] = useState('21:00')
  const [startsOn, setStartsOn] = useState(med?.startsOn ?? today)
  const [endsOn, setEndsOn] = useState(med?.endsOn ?? '')
  const [note, setNote] = useState(med?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={med ? med.name : t('hl.addMed')}>
      <div className="flex flex-col gap-4">
        <Field label={t('hl.medName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus={!med} />
        <Field label={t('hl.dose')} value={dose} onChange={(e) => setDose(e.target.value)} maxLength={60} placeholder={t('hl.doseHint')} />
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('hl.times')}</span>
          <div className="flex flex-wrap gap-2">
            {times.map((slot) => (
              <span key={slot} className="flex min-h-9 items-center gap-1 rounded-full bg-raised pr-1 pl-3 text-sm font-semibold tabular-nums">
                {slot}
                <button type="button" aria-label={t('common.delete')} onClick={() => setTimes(times.filter((x) => x !== slot))} className="flex size-7 items-center justify-center rounded-full text-muted">
                  <X size={14} aria-hidden />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="time" value={draft} onChange={(e) => setDraft(e.target.value)} className={`${INPUT_CLASS} flex-1`} />
            <Button
              variant="secondary"
              disabled={draft === '' || times.includes(draft) || times.length >= 6}
              onClick={() => setTimes([...times, draft].sort())}
            >
              <Plus size={17} aria-hidden />
              {t('common.add')}
            </Button>
          </div>
          <p className="text-[13px] text-muted">{t('hl.timesHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('hl.from')}</span>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">{t('hl.until')}</span>
            <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={INPUT_CLASS} />
          </label>
        </div>
        <Field label={t('hl.medNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={save.isPending}
          disabled={name.trim() === '' || startsOn === ''}
          onClick={() =>
            save.mutate(
              { ...(med ? { id: med.id } : {}), name, dose, times, startsOn, endsOn, note },
              { onSuccess: onClose, onError: (e) => setError(e.message) },
            )
          }
        >
          {t('common.save')}
        </Button>
        {med && (
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(med.id, { onSuccess: onClose })}>
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function DoctorSheet({ doctor, pair, onClose }: { doctor: Doctor | null; pair: Pair; onClose: () => void }) {
  const t = useT()
  const save = useSaveDoctor()
  const remove = useDeleteDoctor()
  const [name, setName] = useState(doctor?.name ?? '')
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? '')
  const [phone, setPhone] = useState(doctor?.phone ?? '')
  const [place, setPlace] = useState(doctor?.place ?? '')
  const [note, setNote] = useState(doctor?.note ?? '')
  const [whose, setWhose] = useState<string>(doctor?.personId ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet open onClose={onClose} title={doctor ? doctor.name : t('hl.addDoctor')}>
      <div className="flex flex-col gap-4">
        <Field label={t('hl.doctorName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus={!doctor} />
        <Field label={t('hl.specialty')} value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={60} placeholder={t('hl.specialtyHint')} />
        <Field label={t('hl.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="+7 7xx xxx xx xx" />
        <Field label={t('hl.place')} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} />
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">{t('hl.whose')}</span>
          <Segmented
            value={whose}
            onChange={setWhose}
            options={[
              { value: pair.userId, label: pair.myName },
              ...(pair.partnerId ? [{ value: pair.partnerId, label: pair.partnerName }] : []),
              { value: '', label: t('hl.shared') },
            ]}
          />
        </div>
        <Field label={t('hl.medNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          loading={save.isPending}
          disabled={name.trim() === ''}
          onClick={() =>
            save.mutate(
              { ...(doctor ? { id: doctor.id } : {}), personId: whose === '' ? null : whose, name, specialty, phone, place, note },
              {
                onSuccess: onClose,
                onError: (e) => setError(e.message.includes('doctors_phone_check') ? t('hl.badPhone') : e.message),
              },
            )
          }
        >
          {t('common.save')}
        </Button>
        {doctor && (
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(doctor.id, { onSuccess: onClose })}>
            <Trash2 size={18} aria-hidden />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
