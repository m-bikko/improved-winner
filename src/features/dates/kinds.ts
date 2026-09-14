/**
 * Виды памятных дат.
 *
 * Лежат отдельно от `api.ts` по одной причине: из этого списка собираются
 * ключи перевода `occasion.<id>`, и проверка полноты словаря обязана его
 * прочитать. `api.ts` тянет за собой клиент Supabase, а тот - переменные
 * сборки, которых в скрипте нет.
 */
export const OCCASION_KINDS = ['birthday', 'anniversary', 'other'] as const
export type OccasionKind = (typeof OCCASION_KINDS)[number]
