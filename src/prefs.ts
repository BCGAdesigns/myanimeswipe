import type { MediaKind } from './types'

export type AnimeFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL'
export type SortMode = 'popular' | 'top' | 'recent'
/** How Descobrir deals the titles it loaded: by the user's taste (once it is known) or shuffled. */
export type DiscoverOrder = 'taste' | 'random'

/** What the user wants to classify, plus discovery filters (the Tinder "age and distance"). */
export interface Preferences {
  kinds: MediaKind[]
  sort: SortMode
  yearMin: number | null
  yearMax: number | null
  /** Community score 0 to 100. */
  minScore: number | null
  /** Canonical genre keys (see genres.ts). */
  avoidGenres: string[]
  animeFormats: AnimeFormat[]
  /** Anime only; TMDB discover can't filter series by episode count. */
  maxEpisodes: number | null
  /** Movies and animated movies, in minutes. */
  maxRuntime: number | null
  /** ISO 639-1 original languages for TMDB titles; empty means any. */
  languages: string[]
  /** Only titles with a subscription streaming offer in Brazil. */
  streamingOnly: boolean
  /** TMDB watch provider ids in Brazil; empty means any. */
  providers: number[]
  /** Not a filter: it reorders what the filters brought, so the catalogs stay. */
  discoverOrder: DiscoverOrder
  updatedAt: number
}

export const ALL_KINDS: MediaKind[] = ['anime', 'movie', 'series', 'cartoon']
export const ALL_ANIME_FORMATS: AnimeFormat[] = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']

export const DEFAULT_PREFS: Preferences = {
  kinds: ALL_KINDS,
  sort: 'popular',
  yearMin: null,
  yearMax: null,
  minScore: null,
  avoidGenres: [],
  animeFormats: ALL_ANIME_FORMATS,
  maxEpisodes: null,
  maxRuntime: null,
  languages: [],
  streamingOnly: false,
  providers: [],
  discoverOrder: 'taste',
  updatedAt: 0,
}

/** Every filter except the content kinds is meant to become a paid feature; free for now. */
export const PREMIUM_FILTERS_UNLOCKED = true

export const KIND_LABELS: Record<MediaKind, string> = {
  anime: 'Anime',
  movie: 'Filmes',
  series: 'Séries',
  cartoon: 'Desenhos',
}

export const KIND_BADGES: Record<MediaKind, string> = {
  anime: 'ANIME',
  movie: 'FILME',
  series: 'SÉRIE',
  cartoon: 'DESENHO',
}

export const KIND_ICONS: Record<MediaKind, string> = {
  anime: '🎌',
  movie: '🎬',
  series: '📺',
  cartoon: '🧸',
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function list<T>(v: unknown, ok: (x: unknown) => boolean, fallback: T[]): T[] {
  return Array.isArray(v) ? (v.filter(ok) as T[]) : fallback
}

/** Checks every field of a stored or remote copy and fills what is missing or malformed. */
export function normalizePrefs(p: unknown): Preferences {
  const raw = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
  const kinds = list<MediaKind>(raw.kinds, (x) => ALL_KINDS.includes(x as MediaKind), DEFAULT_PREFS.kinds)
  return {
    kinds: kinds.length ? kinds : DEFAULT_PREFS.kinds,
    sort: raw.sort === 'top' || raw.sort === 'recent' ? raw.sort : 'popular',
    yearMin: num(raw.yearMin),
    yearMax: num(raw.yearMax),
    minScore: num(raw.minScore),
    avoidGenres: list<string>(raw.avoidGenres, (x) => typeof x === 'string', []),
    animeFormats: list<AnimeFormat>(raw.animeFormats, (x) => ALL_ANIME_FORMATS.includes(x as AnimeFormat), ALL_ANIME_FORMATS),
    maxEpisodes: num(raw.maxEpisodes),
    maxRuntime: num(raw.maxRuntime),
    languages: list<string>(raw.languages, (x) => typeof x === 'string', []),
    streamingOnly: raw.streamingOnly === true,
    providers: list<number>(raw.providers, (x) => typeof x === 'number', []),
    discoverOrder: raw.discoverOrder === 'random' ? 'random' : 'taste',
    updatedAt: num(raw.updatedAt) ?? 0,
  }
}

/** Identifies the catalog a set of filters produces; kinds only pick which catalogs are shown. */
export function filterHash(p: Preferences): string {
  const { kinds: _kinds, updatedAt: _updatedAt, discoverOrder: _order, ...filters } = p
  const stable = Object.entries(filters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
  return JSON.stringify(stable)
}

/** How many filters differ from the defaults (badge on the filters button). */
export function activeFilterCount(p: Preferences): number {
  return [
    p.sort !== DEFAULT_PREFS.sort,
    p.yearMin !== null,
    p.yearMax !== null,
    p.minScore !== null,
    p.avoidGenres.length > 0,
    p.animeFormats.length > 0 && p.animeFormats.length < ALL_ANIME_FORMATS.length,
    p.maxEpisodes !== null,
    p.maxRuntime !== null,
    p.languages.length > 0,
    p.streamingOnly || p.providers.length > 0,
  ].filter(Boolean).length
}
