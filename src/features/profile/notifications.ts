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
  label: string
  hint: string
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  { id: 'meals', label: 'Еда', hint: 'Завтрак, обед и ужин - если не отметил' },
  { id: 'tasks', label: 'Задачи', hint: 'Новая, наступивший срок, удалённая' },
  { id: 'topics', label: 'Темы', hint: 'Новая тема, ответ, закрытие' },
  { id: 'checkin', label: 'Вопрос «как ты»', hint: 'В 11:00 и напоминание в 22:00' },
  { id: 'checkin_partner', label: 'Отметка партнёра', hint: 'Когда второй написал, как он себя чувствует' },
  { id: 'cycle', label: 'Цикл', hint: 'Начало месячных, фазы, предупреждения' },
  { id: 'cycle_tips', label: 'Советы по циклу', hint: 'Подсказка дня в 13:00' },
  { id: 'love_notes', label: 'Про любовь', hint: 'Ежедневное напоминание в 18:00' },
  { id: 'dates', label: 'Важные даты', hint: 'За неделю и в день' },
  { id: 'letters', label: 'Письма из прошлого', hint: 'Утром выбранного дня' },
  { id: 'wishlist', label: 'Вишлисты', hint: 'Любое изменение на общей доске' },
  { id: 'nudge', label: '«Думаю о тебе»', hint: 'Когда партнёр нажал кнопку' },
]
