// Generic media model. Anime comes from AniList today; series and western
// animation (TMDB) plug in later as new `source` / `kind` values.
export type MediaSource = 'anilist'
export type MediaKind = 'anime'

export interface Media {
  /** Global id, `${source}:${sourceId}`. */
  id: string
  source: MediaSource
  sourceId: number
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
  links: { site?: string; mal?: string; crunchyroll?: string }
}

/** The six swipe actions, same meaning on every swipe tab. */
export type SwipeAction = 'want' | 'reject' | 'skip' | 'seen' | 'liked' | 'disliked'

export type EntryStatus = 'want' | 'reject' | 'skip' | 'seen'

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
  updatedAt: number
  /** Time of the last local change (ms); last write wins when syncing. Absent on pre-sync records. */
  rev?: number
}
