// Generic media model. Anime comes from AniList; movies, series and western
// cartoons come from TMDB.
export type MediaSource = 'anilist' | 'tmdb'
export type MediaKind = 'anime' | 'movie' | 'series' | 'cartoon'

export interface Media {
  /** Global id: `anilist:${id}` or `tmdb:${movie|tv}:${id}` (TMDB reuses ids across types). */
  id: string
  source: MediaSource
  sourceId: number
  tmdbType?: 'movie' | 'tv'
  kind: MediaKind
  title: string
  altTitle?: string
  cover: string
  color?: string
  format?: string
  year?: number
  episodes?: number
  genres: string[]
  tags: { name: string; rank: number }[]
  /** Community score, 0 to 100. */
  score?: number
  synopsis?: string
  /** ISO 639-1, TMDB titles only. */
  originalLanguage?: string
  /** Streaming services that list it (AniList external links). */
  streams?: string[]
  links: { site?: string; mal?: string; crunchyroll?: string }
}

/** Eight compass swipes plus double tap (liked) and long press (favorite), same on every swipe tab. */
export type SwipeAction =
  | 'want'
  | 'reject'
  | 'skip'
  | 'seen'
  | 'liked'
  | 'disliked'
  | 'watching'
  | 'paused'
  | 'dropped'
  | 'favorite'

/** Mirrors MyAnimeList: want = plan to watch, paused = on hold; reject and skip are our own. */
export type EntryStatus = 'want' | 'reject' | 'skip' | 'seen' | 'watching' | 'paused' | 'dropped'

export interface Entry {
  mediaId: string
  status: EntryStatus
  /** Confirmed rating 0 to 10. Null while waiting in the rating queue. */
  rating: number | null
  /** Pre-highlighted rating (8 liked, 3 disliked, null plain seen). */
  suggestedRating: number | null
  /** Order key for the rating queue; skipping moves it to the back. */
  queuedAt?: number
  /** Order key for skipped cards; they return after the unseen ones. */
  skippedAt?: number
  via: 'discover' | 'recs'
  favorite?: boolean
  updatedAt: number
  /** Time of the last local change (ms); last write wins when syncing. Absent on pre-sync records. */
  rev?: number
}
