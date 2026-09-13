/**
 * Виды уведомлений для экрана настроек.
 *
 * Список продублирован в CHECK у `notification_settings`: база обязана
 * отвергать неизвестный вид, а форма - не предлагать того, чего база
 * не примет. Совпадение проверяет `check-notification-settings` -
 * та же ловушка, что у состояний в «Как ты».
 */
export type NotificationKind = {
  id: string
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  { id: 'meals' },
  { id: 'tasks' },
  { id: 'topics' },
  { id: 'checkin' },
  { id: 'checkin_partner' },
  { id: 'cycle' },
  { id: 'cycle_tips' },
  { id: 'love_notes' },
  { id: 'dates' },
  { id: 'letters' },
  { id: 'wishlist' },
  { id: 'nudge' },
  { id: 'gratitude' },
]
