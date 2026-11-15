import type { ImdbNomination } from "./imdb";

export interface ImdbGroup {
  eventId: string;
  eventName: string;
  year?: number;
  items: ImdbNomination[];
}

/**
 * Group nominations by ceremony (event + year): winners first inside a group,
 * groups ordered by number of wins, then by number of nominations.
 */
export function groupImdbNominations(nominations: ImdbNomination[]): ImdbGroup[] {
  const byKey = new Map<string, ImdbGroup>();
  for (const n of nominations) {
    const key = `${n.eventId}:${n.year ?? ""}`;
    let g = byKey.get(key);
    if (!g) {
      g = { eventId: n.eventId, eventName: n.eventName, year: n.year, items: [] };
      byKey.set(key, g);
    }
    g.items.push(n);
  }
  const wins = (g: ImdbGroup) => g.items.filter((i) => i.isWinner).length;
  const groups = [...byKey.values()];
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
  }
  groups.sort((a, b) => wins(b) - wins(a) || b.items.length - a.items.length);
  return groups;
}
