import { ALL_KINDS, type AnimeFormat, type Preferences } from '../prefs'
import type { Entry, Media, MediaKind } from '../types'
import { fetchCatalogPage, RateLimitError } from './anilist'
import { fetchDiscoverPage, TmdbUnavailableError, type TmdbSource } from './tmdb'

/** One paginated query per deck source; cartoons mix series and movies. */
export type SourceKey = 'anime' | TmdbSource

const SOURCES_BY_KIND: Record<MediaKind, SourceKey[]> = {
  anime: ['anime'],
  movie: ['movie'],
  series: ['series'],
  cartoon: ['cartoon-tv', 'cartoon-movie'],
}

export const SOURCE_LABEL: Record<SourceKey, string> = {
  anime: 'animes',
  movie: 'filmes',
  series: 'séries',
  'cartoon-tv': 'desenhos',
  'cartoon-movie': 'filmes de animação',
}

export interface SourceCatalog {
  /** Media ids in the order the source returned them. */
  ids: string[]
  nextPage: number
  hasNextPage: boolean
  /** filterHash of the preferences these pages were fetched with. */
  hash: string
  /** Pages in a row that brought nothing new to swipe; prefetch gives up after a few. */
  emptyPages: number
}

export type Catalogs = Partial<Record<SourceKey, SourceCatalog>>

export function sourcesFor(kinds: MediaKind[]): SourceKey[] {
  return ALL_KINDS.filter((k) => kinds.includes(k)).flatMap((k) => SOURCES_BY_KIND[k])
}

export const emptyCatalog = (hash: string): SourceCatalog => ({
  ids: [],
  nextPage: 1,
  hasNextPage: true,
  hash,
  emptyPages: 0,
})

/** The stored catalog when it matches the current filters, otherwise a fresh one. */
export function catalogFor(catalogs: Catalogs, source: SourceKey, hash: string): SourceCatalog {
  const cat = catalogs[source]
  return cat && cat.hash === hash ? cat : emptyCatalog(hash)
}

export function fetchSourcePage(source: SourceKey, page: number, prefs: Preferences) {
  return source === 'anime' ? fetchCatalogPage(page, prefs) : fetchDiscoverPage(source, page, prefs)
}

export function describeSourceError(source: SourceKey, e: unknown): string {
  if (e instanceof RateLimitError) return `O AniList pediu uma pausa. Tente de novo em ${e.retryAfterSec}s.`
  if (e instanceof TmdbUnavailableError) return 'Filmes, séries e desenhos não estão disponíveis nesta versão do app.'
  const text = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|network|load failed/i.test(text)) return 'Sem conexão. Confira a internet e tente de novo.'
  return `Não consegui carregar ${SOURCE_LABEL[source]}: ${text}`
}

/** Unswiped ids per source, in source order. */
export function freshBySource(catalogs: Catalogs, sources: SourceKey[], hash: string, entries: Map<string, Entry>) {
  const out: Partial<Record<SourceKey, string[]>> = {}
  for (const s of sources) out[s] = catalogFor(catalogs, s, hash).ids.filter((id) => !entries.has(id))
  return out
}

/** Alternates between two lists, starting with the first. */
function alternate(a: string[], b: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}

/**
 * The Discover deck: one card of each chosen kind in turn (anime, movie, series, cartoon), then
 * the skipped cards, oldest skip first.
 */
export function buildMixedDeck(
  kinds: MediaKind[],
  catalogs: Catalogs,
  hash: string,
  entries: Map<string, Entry>,
): string[] {
  const sources = sourcesFor(kinds)
  const fresh = freshBySource(catalogs, sources, hash, entries)
  const perKind = ALL_KINDS.filter((k) => kinds.includes(k)).map((k) =>
    k === 'cartoon' ? alternate(fresh['cartoon-tv'] ?? [], fresh['cartoon-movie'] ?? []) : (fresh[k] ?? []),
  )
  const seen = new Set<string>()
  const deck: string[] = []
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      deck.push(id)
    }
  }
  for (let i = 0; perKind.some((list) => i < list.length); i++) {
    for (const list of perKind) if (i < list.length) push(list[i])
  }
  const skipped: Entry[] = []
  for (const s of sources) {
    for (const id of catalogFor(catalogs, s, hash).ids) {
      const e = entries.get(id)
      if (e?.status === 'skip') skipped.push(e)
    }
  }
  skipped.sort((a, b) => (a.skippedAt ?? 0) - (b.skippedAt ?? 0))
  for (const e of skipped) push(e.mediaId)
  return deck
}

/**
 * Filters a title against the preferences with what the app knows locally, for lists that did
 * not come from a filtered query (recommendations). Unknown values pass.
 */
export function passesFilters(m: Media, prefs: Preferences, anilistSitesForProviders: string[]): boolean {
  if (!prefs.kinds.includes(m.kind)) return false
  if (m.genres.some((g) => prefs.avoidGenres.includes(g))) return false
  if (m.year && prefs.yearMin && m.year < prefs.yearMin) return false
  if (m.year && prefs.yearMax && m.year > prefs.yearMax) return false
  if (m.score !== undefined && prefs.minScore && m.score < prefs.minScore) return false
  if (m.kind === 'anime') {
    if (m.format && prefs.animeFormats.length && !prefs.animeFormats.includes(m.format as AnimeFormat)) return false
    if (m.episodes && prefs.maxEpisodes && m.episodes > prefs.maxEpisodes) return false
    if (prefs.providers.length && !m.streams?.some((s) => anilistSitesForProviders.includes(s))) return false
    if (prefs.streamingOnly && !m.streams?.length) return false
  } else if (prefs.languages.length && m.originalLanguage && !prefs.languages.includes(m.originalLanguage)) {
    return false
  }
  return true
}
