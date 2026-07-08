/** All award slugs available at kinopoisk.ru/awards/ */
export const AWARDS: { slug: string; name: string }[] = [
  { slug: "oscar", name: "Оскар" },
  { slug: "golden_globes", name: "Золотой глобус" },
  { slug: "bafta", name: "BAFTA" },
  { slug: "cannes", name: "Каннский кинофестиваль" },
  { slug: "venice", name: "Венецианский кинофестиваль" },
  { slug: "berlin", name: "Берлинский кинофестиваль" },
  { slug: "cesar", name: "Сезар" },
  { slug: "efa", name: "Европейская киноакадемия" },
  { slug: "emmy", name: "Эмми" },
  { slug: "goya", name: "Гойя" },
  { slug: "sag", name: "Гильдия киноактёров (SAG)" },
  { slug: "saturn", name: "Сатурн" },
  { slug: "mtv", name: "MTV" },
  { slug: "razzie", name: "Золотая малина" },
  { slug: "sundance", name: "Сандэнс" },
  { slug: "karlovy_vary", name: "Карловы Вары" },
  { slug: "sanseb", name: "Сан-Себастьян" },
  { slug: "miff", name: "ММКФ" },
  { slug: "kinotavr", name: "Кинотавр" },
  { slug: "nika", name: "Ника" },
  { slug: "orel", name: "Золотой орёл" },
  { slug: "georges", name: "Жорж" },
  { slug: "mtv_russia", name: "MTV Россия" },
  { slug: "asian", name: "Азиатская киноакадемия" },
];

export const awardNameBySlug = new Map(AWARDS.map((a) => [a.slug, a.name]));

/**
 * For a film released in year Y we scan award years Y, Y+1, Y+2 —
 * but never beyond the current year: future ceremonies don't exist yet.
 */
export function scanYears(filmYear: number): number[] {
  const currentYear = new Date().getFullYear();
  return [filmYear, filmYear + 1, filmYear + 2].filter(
    (y) => y <= currentYear,
  );
}
