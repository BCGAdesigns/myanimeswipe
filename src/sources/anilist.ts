import { anilistGenreNames, genreKey } from '../genres'
import { ALL_ANIME_FORMATS, type Preferences } from '../prefs'
import type { Media } from '../types'
import { anilistSites } from './providers'

const ENDPOINT = 'https://graphql.anilist.co'

export const PAGE_SIZE = 50

const MEDIA_FIELDS = `
  id
  idMal
  siteUrl
  title { romaji english }
  coverImage { extraLarge large color }
  format
  episodes
  seasonYear
  genres
  tags { name rank isMediaSpoiler }
  averageScore
  description(asHtml: false)
  isAdult
  externalLinks { site url type }`

// isAdult: false only drops hentai on AniList; seinen and ecchi stay in (and can be avoided by genre).
const CATALOG_QUERY = `
query Catalog(
  $page: Int, $perPage: Int, $sort: [MediaSort], $formats: [MediaFormat], $genresNot: [String],
  $from: FuzzyDateInt, $to: FuzzyDateInt, $minScore: Int, $maxEpisodes: Int, $statusNot: MediaStatus,
  $licensedBy: [String]
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(
      type: ANIME
      isAdult: false
      sort: $sort
      format_in: $formats
      genre_not_in: $genresNot
      startDate_greater: $from
      startDate_lesser: $to
      averageScore_greater: $minScore
      episodes_lesser: $maxEpisodes
      status_not: $statusNot
      licensedBy_in: $licensedBy
    ) {${MEDIA_FIELDS}
    }
  }
}`

const RECS_QUERY = `
query Recs($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      recommendations(sort: RATING_DESC, perPage: 10) {
        nodes { rating mediaRecommendation {${MEDIA_FIELDS} } }
      }
    }
  }
}`

const SEARCH_QUERY = `
query Search($q: String) {
  Page(perPage: 15) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {${MEDIA_FIELDS}
    }
  }
}`

// SEQUEL is "released after the relation": the next season, or a movie or special that continues it.
const SEQUELS_QUERY = `
query Sequels($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      relations { edges { relationType(version: 2) node { id type } } }
    }
  }
}`

interface RawMedia {
  id: number
  idMal: number | null
  siteUrl: string | null
  title: { romaji: string | null; english: string | null }
  coverImage: { extraLarge: string | null; large: string | null; color: string | null }
  format: string | null
  episodes: number | null
  seasonYear: number | null
  genres: string[] | null
  tags: { name: string; rank: number; isMediaSpoiler: boolean }[] | null
  averageScore: number | null
  description: string | null
  isAdult?: boolean | null
  externalLinks: { site: string; url: string; type: string | null }[] | null
}

export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`AniList rate limit, retry in ${retryAfterSec}s`)
  }
}

/** AniList descriptions carry <br> and <i> even with asHtml: false. */
export function cleanSynopsis(text: string | null): string | undefined {
  if (!text) return undefined
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function toMedia(raw: RawMedia): Media {
  const title = raw.title.english || raw.title.romaji || `#${raw.id}`
  const alt = raw.title.romaji && raw.title.romaji !== title ? raw.title.romaji : undefined
  const links = raw.externalLinks ?? []
  const crunchyroll = links.find((l) => l.site.toLowerCase() === 'crunchyroll')?.url
  const streams = [...new Set(links.filter((l) => l.type === 'STREAMING').map((l) => l.site))]
  return {
    id: `anilist:${raw.id}`,
    source: 'anilist',
    sourceId: raw.id,
    kind: 'anime',
    title,
    altTitle: alt,
    cover: raw.coverImage.extraLarge || raw.coverImage.large || '',
    color: raw.coverImage.color ?? undefined,
    format: raw.format ?? undefined,
    year: raw.seasonYear ?? undefined,
    episodes: raw.episodes ?? undefined,
    genres: (raw.genres ?? []).map(genreKey),
    tags: (raw.tags ?? []).filter((t) => !t.isMediaSpoiler).map((t) => ({ name: t.name, rank: t.rank })),
    score: raw.averageScore ?? undefined,
    synopsis: cleanSynopsis(raw.description),
    streams: streams.length ? streams : undefined,
    links: {
      site: raw.siteUrl ?? undefined,
      mal: raw.idMal ? `https://myanimelist.net/anime/${raw.idMal}` : undefined,
      crunchyroll,
    },
  }
}

const SORT: Record<Preferences['sort'], string> = {
  popular: 'POPULARITY_DESC',
  top: 'SCORE_DESC',
  recent: 'START_DATE_DESC',
}

/** Turns preferences into AniList filter arguments (its comparisons are strict, hence the ±1). */
export function catalogVariables(prefs: Preferences, page: number) {
  return {
    page,
    perPage: PAGE_SIZE,
    sort: [SORT[prefs.sort]],
    formats: prefs.animeFormats.length ? prefs.animeFormats : ALL_ANIME_FORMATS,
    genresNot: prefs.avoidGenres.length ? anilistGenreNames(prefs.avoidGenres) : undefined,
    from: prefs.yearMin ? prefs.yearMin * 10000 : undefined,
    to: prefs.yearMax ? (prefs.yearMax + 1) * 10000 : undefined,
    minScore: prefs.minScore ? prefs.minScore - 1 : undefined,
    maxEpisodes: prefs.maxEpisodes ? prefs.maxEpisodes + 1 : undefined,
    // "Recent" would otherwise lead with announced titles that have not aired.
    statusNot: prefs.sort === 'recent' ? 'NOT_YET_RELEASED' : undefined,
    licensedBy: prefs.providers.length ? anilistSites(prefs.providers) : undefined,
  }
}

async function post(query: string, variables: unknown) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 429) {
    throw new RateLimitError(Number(res.headers.get('Retry-After')) || 60)
  }
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(json.errors?.[0]?.message ?? `AniList HTTP ${res.status}`)
  }
  return json.data
}

const usable = (m: RawMedia | null): m is RawMedia => !!m && !m.isAdult && !!(m.coverImage.extraLarge || m.coverImage.large)

export async function fetchCatalogPage(page: number, prefs: Preferences): Promise<{ media: Media[]; hasNextPage: boolean }> {
  const variables = catalogVariables(prefs, page)
  // None of the chosen services carries anime on AniList: nothing to show, rather than everything.
  if (variables.licensedBy?.length === 0) return { media: [], hasNextPage: false }
  const data = await post(CATALOG_QUERY, variables)
  const media = (data.Page.media as RawMedia[]).filter(usable).map(toMedia)
  return {
    // AniList can't filter by "has any streaming link"; the services filter above is server side.
    media: prefs.streamingOnly && !prefs.providers.length ? media.filter((m) => m.streams?.length) : media,
    hasNextPage: data.Page.pageInfo.hasNextPage,
  }
}

export async function searchAnime(q: string): Promise<Media[]> {
  const data = await post(SEARCH_QUERY, { q })
  return (data.Page.media as RawMedia[]).filter(usable).map(toMedia)
}

export interface Recommendation {
  media: Media
  /** Community votes for "if you liked the seed, watch this". */
  votes: number
}

export interface RawRelations {
  id: number
  relations: {
    edges: ({ relationType: string | null; node: { id: number; type: string | null } | null } | null)[] | null
  } | null
}

/** Anime that directly continue this one; side stories, spin-offs, prequels and manga are left out. */
export function directSequels(raw: RawRelations): number[] {
  return (raw.relations?.edges ?? []).flatMap((e) => (e?.relationType === 'SEQUEL' && e.node?.type === 'ANIME' ? [e.node.id] : []))
}

/** Next step of each anime's sequel chain, 50 anime per request. */
export async function fetchDirectSequels(sourceIds: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>()
  for (let i = 0; i < sourceIds.length; i += PAGE_SIZE) {
    const data = await post(SEQUELS_QUERY, { ids: sourceIds.slice(i, i + PAGE_SIZE) })
    for (const raw of data.Page.media as RawRelations[]) out.set(raw.id, directSequels(raw))
  }
  return out
}

/** Community recommendations for several anime in one request (validated live: 10 seeds, no complexity error). */
export async function fetchAnimeRecs(sourceIds: number[]): Promise<Map<number, Recommendation[]>> {
  const data = await post(RECS_QUERY, { ids: sourceIds })
  const out = new Map<number, Recommendation[]>()
  for (const seed of data.Page.media as { id: number; recommendations: { nodes: { rating: number; mediaRecommendation: RawMedia | null }[] } }[]) {
    out.set(
      seed.id,
      seed.recommendations.nodes
        .filter((n) => usable(n.mediaRecommendation))
        .map((n) => ({ media: toMedia(n.mediaRecommendation!), votes: Math.max(0, n.rating) })),
    )
  }
  return out
}
