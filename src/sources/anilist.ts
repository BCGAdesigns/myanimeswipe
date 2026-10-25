import type { Media } from '../types'

const ENDPOINT = 'https://graphql.anilist.co'

export const PAGE_SIZE = 50

// isAdult: false only drops hentai on AniList; seinen and ecchi stay in.
const CATALOG_QUERY = `
query Catalog($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(
      type: ANIME
      isAdult: false
      sort: POPULARITY_DESC
      format_in: [TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL]
    ) {
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
      externalLinks { site url type }
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
  const crunchyroll = raw.externalLinks?.find((l) => l.site.toLowerCase() === 'crunchyroll')?.url
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
    genres: raw.genres ?? [],
    tags: (raw.tags ?? []).filter((t) => !t.isMediaSpoiler).map((t) => ({ name: t.name, rank: t.rank })),
    score: raw.averageScore ?? undefined,
    synopsis: cleanSynopsis(raw.description),
    links: {
      site: raw.siteUrl ?? undefined,
      mal: raw.idMal ? `https://myanimelist.net/anime/${raw.idMal}` : undefined,
      crunchyroll,
    },
  }
}

export async function fetchCatalogPage(page: number): Promise<{ media: Media[]; hasNextPage: boolean }> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: CATALOG_QUERY, variables: { page, perPage: PAGE_SIZE } }),
  })
  if (res.status === 429) {
    throw new RateLimitError(Number(res.headers.get('Retry-After')) || 60)
  }
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(json.errors?.[0]?.message ?? `AniList HTTP ${res.status}`)
  }
  const pageData = json.data.Page
  return {
    media: (pageData.media as RawMedia[]).filter((m) => m.coverImage.extraLarge || m.coverImage.large).map(toMedia),
    hasNextPage: pageData.pageInfo.hasNextPage,
  }
}
