/** Категории идей - тот же список, что в CHECK у date_ideas. */
export const IDEA_CATEGORIES = ['distance', 'home', 'city', 'trip'] as const
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]
