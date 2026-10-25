import { genresFromTmdb, tmdbGenreIds, TMDB_ANIMATION, TMDB_TV_EXCLUDED } from '../genres'
import type { Preferences } from '../prefs'
import type { Media, MediaKind } from '../types'

// Requests go through the `tmdb` edge function (supabase/functions/tmdb), which holds the
// TMDB credential; the browser never sees it.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const PROXY = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/tmdb` : null

export const tmdbConfigured = PROXY !== null

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
/** TMDB keyword "anime": keeps Japanese animation out of the cartoon decks (AniList covers it). */
export const TMDB_ANIME_KEYWORD = 210024
/** TMDB serves at most 500 pages of any discover query. */
const MAX_PAGE = 500
/** Below this many votes the average is noise, so the card shows no score. */
const MIN_VOTES_FOR_SCORE = 20

export type TmdbType = 'movie' | 'tv'
export type TmdbSource = 'movie' | 'series' | 'cartoon-tv' | 'cartoon-movie'

export const TMDB_TYPE: Record<TmdbSource, TmdbType> = {
  movie: 'movie',
  series: 'tv',
  'cartoon-tv': 'tv',
  'cartoon-movie': 'movie',
}

const KIND: Record<TmdbSource, MediaKind> = {
  movie: 'movie',
  series: 'series',
  'cartoon-tv': 'cartoon',
  'cartoon-movie': 'cartoon',
}

export class TmdbUnavailableError extends Error {
  constructor() {
    super('TMDB proxy not configured')
  }
}

interface RawTmdb {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  vote_average?: number
  vote_count?: number
  overview?: string
  original_language?: string
  adult?: boolean
  media_type?: string
}

interface RawPage {
  page: number
  total_pages: number
  results: RawTmdb[]
}

export function toMediaTmdb(raw: RawTmdb, type: TmdbType, kind: MediaKind): Media | null {
  if (!raw.poster_path || raw.adult) return null
  const title = (type === 'movie' ? raw.title : raw.name) || raw.original_title || raw.original_name || `#${raw.id}`
  const original = type === 'movie' ? raw.original_title : raw.original_name
  const date = type === 'movie' ? raw.release_date : raw.first_air_date
  const year = date ? Number(date.slice(0, 4)) : NaN
  return {
    id: `tmdb:${type}:${raw.id}`,
    source: 'tmdb',
    sourceId: raw.id,
    tmdbType: type,
    kind,
    title,
    altTitle: original && original !== title ? original : undefined,
    cover: `${IMAGE_BASE}${raw.poster_path}`,
    format: type === 'movie' ? 'MOVIE' : 'SERIES',
    year: Number.isFinite(year) && year > 0 ? year : undefined,
    genres: genresFromTmdb(raw.genre_ids ?? [], type),
    tags: [],
    score: (raw.vote_count ?? 0) >= MIN_VOTES_FOR_SCORE ? Math.round((raw.vote_average ?? 0) * 10) : undefined,
    synopsis: raw.overview?.trim() || undefined,
    originalLanguage: raw.original_language,
    links: { site: `https://www.themoviedb.org/${type}/${raw.id}` },
  }
}

/** Kind of a TMDB title found outside a kind-specific query (recommendations). */
export function kindOfTmdb(raw: RawTmdb, type: TmdbType): MediaKind | null {
  const genres = raw.genre_ids ?? []
  if (genres.includes(TMDB_ANIMATION)) return raw.original_language === 'ja' ? null : 'cartoon'
  if (type === 'tv' && genres.some((g) => TMDB_TV_EXCLUDED.includes(g))) return null
  return type === 'movie' ? 'movie' : 'series'
}

type Params = Record<string, string | number>

/** Builds the /discover query for one deck source (exported for tests). */
export function discoverParams(source: TmdbSource, prefs: Preferences, page: number, today: string) {
  const type = TMDB_TYPE[source]
  const cartoon = source === 'cartoon-tv' || source === 'cartoon-movie'
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date'
  const params: Params = {
    page,
    include_adult: 'false',
    sort_by: { popular: 'popularity.desc', top: 'vote_average.desc', recent: `${dateField}.desc` }[prefs.sort],
  }
  // Without a vote floor, "top" fills up with titles rated 10 by two people.
  let minVotes = { popular: 0, top: type === 'movie' ? 500 : 200, recent: type === 'movie' ? 20 : 10 }[prefs.sort]

  const without = tmdbGenreIds(prefs.avoidGenres, type)
  if (cartoon) {
    params.with_genres = TMDB_ANIMATION
    params.without_keywords = TMDB_ANIME_KEYWORD
  } else {
    without.push(TMDB_ANIMATION)
  }
  if (type === 'tv') without.push(...TMDB_TV_EXCLUDED)
  // A comma list excludes titles having any of them (checked live).
  if (without.length) params.without_genres = [...new Set(without)].join(',')

  if (prefs.yearMin) params[`${dateField}.gte`] = `${prefs.yearMin}-01-01`
  let latest = prefs.yearMax ? `${prefs.yearMax}-12-31` : null
  // "Recent" means released already, not the furthest announced date.
  if (prefs.sort === 'recent' && (!latest || latest > today)) latest = today
  if (latest) params[`${dateField}.lte`] = latest

  if (prefs.minScore) {
    params['vote_average.gte'] = prefs.minScore / 10
    minVotes = Math.max(minVotes, 50)
  }
  if (minVotes) params['vote_count.gte'] = minVotes
  if (type === 'movie' && prefs.maxRuntime) params['with_runtime.lte'] = prefs.maxRuntime
  if (prefs.languages.length) params.with_original_language = prefs.languages.join('|')
  if (prefs.providers.length || prefs.streamingOnly) {
    params.watch_region = 'BR'
    params.with_watch_monetization_types = 'flatrate|free|ads'
    if (prefs.providers.length) params.with_watch_providers = prefs.providers.join('|')
  }
  return { path: `/discover/${type}`, params }
}

async function get<T>(path: string, params: Params = {}): Promise<T> {
  if (!PROXY) throw new TmdbUnavailableError()
  const url = new URL(PROXY)
  url.searchParams.set('path', path)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  // A plain GET without custom headers skips the CORS preflight.
  const res = await fetch(url)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.status_message ?? json?.error ?? `TMDB HTTP ${res.status}`)
  return json as T
}

const today = () => new Date().toISOString().slice(0, 10)

export async function fetchDiscoverPage(
  source: TmdbSource,
  page: number,
  prefs: Preferences,
): Promise<{ media: Media[]; hasNextPage: boolean }> {
  const { path, params } = discoverParams(source, prefs, page, today())
  const data = await get<RawPage>(path, params)
  const type = TMDB_TYPE[source]
  const cartoon = KIND[source] === 'cartoon'
  const media = data.results
    // The anime keyword misses a few Japanese titles; drop what is left.
    .filter((r) => !(cartoon && r.original_language === 'ja'))
    .map((r) => toMediaTmdb(r, type, KIND[source]))
    .filter((m): m is Media => m !== null)
  return { media, hasNextPage: data.page < Math.min(data.total_pages, MAX_PAGE) }
}

/** "If you liked this, watch these", best first (TMDB gives no vote counts here). */
export async function fetchTmdbRecs(type: TmdbType, id: number): Promise<Media[]> {
  const data = await get<RawPage>(`/${type}/${id}/recommendations`)
  return data.results.flatMap((raw) => {
    const rawType: TmdbType = raw.media_type === 'tv' || raw.media_type === 'movie' ? raw.media_type : type
    const kind = kindOfTmdb(raw, rawType)
    const media = kind && toMediaTmdb(raw, rawType, kind)
    return media ? [media] : []
  })
}
