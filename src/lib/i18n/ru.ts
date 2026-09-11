/**
 * Русский словарь - ИСТОЧНИК ИСТИНЫ.
 *
 * Остальные языки типизированы по нему: пропущенный ключ в казахском
 * или английском - ошибка сборки, а не пустое место на экране. Это и есть
 * гарантия того, что при переводе ничего не потеряется.
 *
 * Ключи плоские и с точками, потому что вложенность здесь ничего не даёт,
 * а точный ключ в поиске по коду находится сразу.
 *
 * Считаемые слова хранятся тройкой `.one/.few/.many` - см. `pluralFor`:
 * у трёх языков три разных правила, и свести их к одному нельзя.
 */
export const ru = {
  // --- общее ---------------------------------------------------------------
  'common.save': 'Сохранить',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  'common.close': 'Закрыть',
  'common.edit': 'Изменить',
  'common.add': 'Добавить',
  'common.done': 'Готово',
  'common.back': 'Назад',
  'common.loading': 'Загрузка',
  'common.retry': 'Повторить',
  'common.optional': 'необязательно',
  'common.refresh': 'Обновить',
  'common.openMenu': 'Открыть меню',
  'common.today': 'Сегодня',
  'common.yesterday': 'Вчера',
  'common.tomorrow': 'Завтра',
  'common.dayAfterTomorrow': 'послезавтра',
  'common.nothingYet': 'Пока пусто',
  'common.errorTitle': 'Что-то пошло не так',

  'unit.kcal': 'ккал',
  'unit.gram': 'г',
  'unit.kg': 'кг',
  'unit.min': 'мин',
  'unit.day.one': 'день',
  'unit.day.few': 'дня',
  'unit.day.many': 'дней',
  'unit.hour.one': 'час',
  'unit.hour.few': 'часа',
  'unit.hour.many': 'часов',

  // --- меню и разделы ------------------------------------------------------
  'nav.today': 'Сегодня',
  'nav.checkin': 'Как ты',
  'nav.topics': 'Темы',
  'nav.tasks': 'Задачи',
  'nav.diary': 'Дневник',
  'nav.foods': 'Продукты',
  'nav.cycle': 'Цикл',
  'nav.dates': 'Даты',
  'nav.wishlist': 'Вишлист',
  'nav.profile': 'Профиль',
  'nav.signOut': 'Выйти',
  'nav.sections': 'Разделы',
  'nav.closeMenu': 'Закрыть меню',
  'title.year': 'Год в цифрах',
  'title.month': 'Итоги месяца',
  'title.notifications': 'Уведомления',
  'title.cycleReport': 'Выписка',

  // --- вход ----------------------------------------------------------------
  'login.who': 'Кто заходит?',
  'login.enterPin': 'Введи PIN',
  'login.wait': 'Подожди {n} с',
  'login.wrongPin': 'Неверный PIN',
  'login.rateLimited': 'Слишком много попыток. Подожди минуту.',
  'login.offline': 'Нет связи с сервером',
  'login.switchUser': 'Сменить пользователя',
  'login.faceId': 'Войти по Face ID',
  'login.faceIdFailed': 'Не удалось подтвердить — введи PIN',

  // --- язык ----------------------------------------------------------------
  'lang.title': 'Язык',
  'lang.hint': 'Свой у каждого. Уведомления тоже придут на нём.',
  // --- самочувствие --------------------------------------------------------
  'checkinGroup.mood': 'Настроение',
  'checkinGroup.energy': 'Силы',
  'checkinGroup.body': 'Тело',
  'checkinGroup.us': 'Про нас',
  'checkinGroup.doing': 'Чем занят',
  'state.joy': 'Радостно',
  'state.calm': 'Спокойно',
  'state.inlove': 'Влюблённо',
  'state.grateful': 'Благодарно',
  'state.inspired': 'Вдохновлённо',
  'state.proud': 'Гордо',
  'state.sad': 'Грустно',
  'state.anxious': 'Тревожно',
  'state.irritated': 'Раздражённо',
  'state.angry': 'Злюсь',
  'state.lonely': 'Одиноко',
  'state.bored': 'Скучно',
  'state.lost': 'Растерянно',
  'state.guilty': 'Виновато',
  'state.energetic': 'Бодро',
  'state.strong': 'Полон сил',
  'state.secondwind': 'Второе дыхание',
  'state.sleepy': 'Сонливо',
  'state.exhausted': 'Вымотан',
  'state.broken': 'Разбито',
  'state.healthy': 'Всё отлично',
  'state.headache': 'Болит голова',
  'state.stomach': 'Болит живот',
  'state.nausea': 'Тошнит',
  'state.sore': 'Мышцы болят',
  'state.back': 'Спина',
  'state.sick': 'Простыл',
  'state.poop': 'Какаю',
  'state.hungry': 'Голоден',
  'state.stuffed': 'Объелся',
  'state.thirsty': 'Хочу пить',
  'state.cold': 'Мёрзну',
  'state.hot': 'Жарко',
  'state.pms': 'ПМС',
  'state.period': 'Эти дни',
  'state.miss': 'Скучаю',
  'state.wantmeet': 'Хочу увидеться',
  'state.wanthug': 'Хочу обняться',
  'state.needtalk': 'Надо поговорить',
  'state.allgoodus': 'У нас всё хорошо',
  'state.working': 'Работаю',
  'state.swamped': 'Завал',
  'state.free': 'Свободен',
  'state.onroad': 'В дороге',
  'state.training': 'На тренировке',
  'state.resting': 'Отдыхаю',

} as const

export type Key = keyof typeof ru
export type Dict = Record<Key, string>
