/* IMDb event edition data via the public IMDb GraphQL API.
 * Gives the full list of films/people nominated in every category
 * of a specific award ceremony (e.g. Oscars 2025).
 */

import { IMDB_EVENT_ID, parseYear } from "./api";
import { PermanentError, request } from "./http";

export interface EventEntity {
  /** tt... or nm... */
  id: string;
  text: string;
  year?: number;
  kind: "title" | "name";
}

export interface EventNomination {
  isWinner: boolean;
  titles: EventEntity[];
  names: EventEntity[];
}

export interface EventCategory {
  award: string;
  category: string;
  nominations: EventNomination[];
}

export interface EventEditionPayload {
  eventId: string;
  eventName: string;
  year: number;
  categories: EventCategory[];
}

const GRAPHQL_URL = "https://api.graphql.imdb.com/";

const QUERY = `
query EventEdition($eventId: ID!, $year: Int!) {
  nominationEvent(id: $eventId) {
    id
    name { text }
    editions(limit: 5, filter: { includeYears: [$year] }) {
      id
      year
      awards(limit: 50) {
        text
        nominationCategories(first: 100) {
          edges { node {
            category { text }
            nominations(first: 100) {
              edges { node {
                isWinner
                awardedEntities {
                  ... on AwardedTitles {
                    awardTitles { title { id titleText { text } releaseYear { year } } }
                    secondaryAwardNames { name { id nameText { text } } }
                  }
                  ... on AwardedNames {
                    awardNames { name { id nameText { text } } }
                    secondaryAwardTitles { title { id titleText { text } releaseYear { year } } }
                  }
                }
              } }
            }
          } }
        }
      }
    }
  }
}
`;

/* --------- raw response shapes (partial) --------- */
interface RawTitle {
  title?: {
    id?: string;
    titleText?: { text?: string };
    releaseYear?: { year?: number };
  };
}
interface RawName {
  name?: { id?: string; nameText?: { text?: string } };
}
interface RawNominationNode {
  isWinner?: boolean;
  awardedEntities?: {
    awardTitles?: RawTitle[];
    secondaryAwardNames?: RawName[];
    awardNames?: RawName[];
    secondaryAwardTitles?: RawTitle[];
  };
}

/** POST the query; 429/5xx and network errors are retried, GraphQL errors are not */
function gql(variables: Record<string, unknown>): Promise<unknown> {
  return request(
    GRAPHQL_URL,
    async (res) => {
      const data = (await res.json()) as {
        data?: unknown;
        errors?: Array<{ message?: string }>;
      };
      if (data.errors?.length) {
        throw new PermanentError(data.errors[0]?.message ?? "GraphQL error");
      }
      return data.data;
    },
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables }),
      timeoutMs: 45_000,
      retries: 3,
      backoffMs: 1500,
    },
  );
}

function mapTitles(items?: RawTitle[]): EventEntity[] {
  return (items ?? [])
    .filter((t) => t.title?.id && t.title.titleText?.text)
    .map((t) => ({
      id: t.title!.id!,
      text: t.title!.titleText!.text!,
      year: t.title!.releaseYear?.year,
      kind: "title" as const,
    }));
}

function mapNames(items?: RawName[]): EventEntity[] {
  return (items ?? [])
    .filter((n) => n.name?.id && n.name.nameText?.text)
    .map((n) => ({
      id: n.name!.id!,
      text: n.name!.nameText!.text!,
      kind: "name" as const,
    }));
}

export async function fetchEventEdition(
  eventId: string,
  year: number,
): Promise<EventEditionPayload> {
  if (!IMDB_EVENT_ID.test(eventId)) throw new Error("Некорректный ID события");
  if (parseYear(year) === null) throw new Error("Некорректный год");

  const data = (await gql({ eventId, year })) as {
    nominationEvent?: {
      id?: string;
      name?: { text?: string };
      editions?: Array<{
        year?: number;
        awards?: Array<{
          text?: string;
          nominationCategories?: {
            edges?: Array<{
              node?: {
                category?: { text?: string };
                nominations?: { edges?: Array<{ node?: RawNominationNode }> };
              };
            }>;
          };
        }>;
      }>;
    };
  };

  const ev = data.nominationEvent;
  if (!ev) throw new Error("Событие не найдено на IMDb");
  const edition = (ev.editions ?? []).find((e) => e.year === year) ?? ev.editions?.[0];
  if (!edition) {
    throw new Error(`Для события нет данных за ${year} год`);
  }

  const categories: EventCategory[] = [];
  for (const award of edition.awards ?? []) {
    for (const catEdge of award.nominationCategories?.edges ?? []) {
      const node = catEdge.node;
      if (!node) continue;
      const nominations: EventNomination[] = [];
      for (const nomEdge of node.nominations?.edges ?? []) {
        const n = nomEdge.node;
        if (!n) continue;
        const ents = n.awardedEntities ?? {};
        const titles = [
          ...mapTitles(ents.awardTitles),
          ...mapTitles(ents.secondaryAwardTitles),
        ];
        const names = [
          ...mapNames(ents.awardNames),
          ...mapNames(ents.secondaryAwardNames),
        ];
        if (titles.length === 0 && names.length === 0) continue;
        nominations.push({ isWinner: Boolean(n.isWinner), titles, names });
      }
      if (nominations.length === 0) continue;
      nominations.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
      categories.push({
        award: award.text ?? "",
        category: node.category?.text ?? award.text ?? "Category",
        nominations,
      });
    }
  }

  if (categories.length === 0) {
    throw new Error(`Для события нет детальных данных за ${year} год`);
  }

  return {
    eventId,
    eventName: ev.name?.text ?? eventId,
    year: edition.year ?? year,
    categories,
  };
}
