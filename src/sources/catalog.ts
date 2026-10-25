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

const NONE: ReadonlySet<string> = new Set()

/** Unswiped ids per source, in source order, without the hidden ones (later seasons of dropped anime). */
export function freshBySource(
  catalogs: Catalogs,
  sources: SourceKey[],
  hash: string,
  entries: Map<string, Entry>,
  hidden: ReadonlySet<string> = NONE,
) {
  const out: Partial<Record<SourceKey, string[]>> = {}
  for (const s of sources) out[s] = catalogFor(catalogs, s, hash).ids.filter((id) => !entries.has(id) && !hidden.has(id))
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

/** Kind of the last swiped title, and source of the last swiped cartoon; the deck continues after them. */
export interface DeckPhase {
  lastKind: MediaKind | null
  lastCartoon: SourceKey | null
}

const NO_PHASE: DeckPhase = { lastKind: null, lastCartoon: null }

export function deckPhase(entries: Map<string, Entry>, media: Map<string, Media>): DeckPhase {
  let last: { rev: number; kind: MediaKind } | null = null
  let lastCartoon: { rev: number; source: SourceKey } | null = null
  for (const e of entries.values()) {
    const m = media.get(e.mediaId)
    if (!m) continue
    const rev = e.rev ?? e.updatedAt
    if (!last || rev > last.rev) last = { rev, kind: m.kind }
    if (m.kind === 'cartoon' && (!lastCartoon || rev > lastCartoon.rev)) {
      lastCartoon = { rev, source: m.tmdbType === 'movie' ? 'cartoon-movie' : 'cartoon-tv' }
    }
  }
  return { lastKind: last?.kind ?? null, lastCartoon: lastCartoon?.source ?? null }
}

export interface DeckOptions {
  phase?: DeckPhase
  /** Skipped cards of a source come back only once it has nothing new left to load. */
  exhausted?: (source: SourceKey) => boolean
  /** Never in the deck, skipped or not (later seasons of dropped anime). */
  hidden?: ReadonlySet<string>
  /** Reorders each source's unswiped titles (by taste, or shuffled); catalog order without it. */
  arrange?: (ids: string[]) => string[]
}

/**
 * The Discover deck: one card of each chosen kind in turn (anime, movie, series, cartoon),
 * starting after the kind swiped last so every kind gets its turn, then the skipped cards,
 * oldest skip first. Skipped cards of a source come back only once it has nothing new left to
 * load (`exhausted`), so a new device fetches more pages instead of repeating them.
 */
export function buildMixedDeck(
  kinds: MediaKind[],
  catalogs: Catalogs,
  hash: string,
  entries: Map<string, Entry>,
  { phase = NO_PHASE, exhausted = () => true, hidden = NONE, arrange }: DeckOptions = {},
): string[] {
  const sources = sourcesFor(kinds)
  const fresh = freshBySource(catalogs, sources, hash, entries, hidden)
  if (arrange) for (const s of sources) fresh[s] = arrange(fresh[s] ?? [])
  const order = ALL_KINDS.filter((k) => kinds.includes(k))
  // indexOf is -1 when the last swipe was of a kind no longer chosen: start from the first.
  const start = phase.lastKind ? (order.indexOf(phase.lastKind) + 1) % order.length : 0
  const perKind = [...order.slice(start), ...order.slice(0, start)].map((k) => {
    if (k !== 'cartoon') return fresh[k] ?? []
    const tv = fresh['cartoon-tv'] ?? []
    const movies = fresh['cartoon-movie'] ?? []
    return phase.lastCartoon === 'cartoon-tv' ? alternate(movies, tv) : alternate(tv, movies)
  })
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
    if (!exhausted(s)) continue
    for (const id of catalogFor(catalogs, s, hash).ids) {
      const e = entries.get(id)
      if (e?.status === 'skip' && !hidden.has(id)) skipped.push(e)
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
