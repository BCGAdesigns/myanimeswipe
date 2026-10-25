import type { Entry, SwipeAction } from './types'

export const LIKED_RATING = 8
export const DISLIKED_RATING = 3
export const FAVORITE_RATING = 10

/** Minimum drag distance in px before a release counts as a swipe. */
export const SWIPE_THRESHOLD = 90

/**
 * Compass sectors of 45°, counter-clockwise from the right. Right half = watching or done,
 * left half = stopped or out; up = positive, down = negative.
 */
const COMPASS: SwipeAction[] = ['seen', 'watching', 'want', 'paused', 'skip', 'dropped', 'reject', 'disliked']

/** Maps a drag vector to one of the eight compass actions (angles measured with up as positive). */
export function classifySwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD): SwipeAction | null {
  if (Math.hypot(dx, dy) < threshold) return null
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
  return COMPASS[(Math.round(angle / 45) + 8) % 8]
}

/**
 * Rating tab: the eight directions are the ratings 1 to 8, like a dial: 8 straight up, then one
 * less at each step clockwise (↑ 8, ↗ 7, → 6, ↘ 5, ↓ 4, ↙ 3, ← 2, ↖ 1). The 9, the favorite, is a
 * double tap or a long press. Indexed like COMPASS, counter-clockwise from the right.
 */
const RATE_COMPASS = [6, 7, 8, 1, 2, 3, 4, 5]

export function classifyRateSwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD): number | null {
  if (Math.hypot(dx, dy) < threshold) return null
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
  return RATE_COMPASS[(Math.round(angle / 45) + 8) % 8]
}

/** Screen direction (x right, y down) of the drag that gives each rating. */
export function rateVector(stars: number): [number, number] {
  const i = RATE_COMPASS.indexOf(stars)
  const rad = (i * 45 * Math.PI) / 180
  return [Math.round(Math.cos(rad) * 100) / 100, Math.round(-Math.sin(rad) * 100) / 100]
}

export function applyAction(
  mediaId: string,
  action: SwipeAction,
  via: Entry['via'],
  now: number,
): Entry {
  const base = { mediaId, via, updatedAt: now, rating: null, suggestedRating: null }
  switch (action) {
    case 'want':
    case 'reject':
    case 'watching':
    case 'paused':
    case 'dropped':
      return { ...base, status: action }
    case 'skip':
      return { ...base, status: 'skip', skippedAt: now }
    case 'seen':
      return { ...base, status: 'seen', queuedAt: now }
    case 'liked':
      return { ...base, status: 'seen', suggestedRating: LIKED_RATING, queuedAt: now }
    case 'disliked':
      return { ...base, status: 'seen', suggestedRating: DISLIKED_RATING, queuedAt: now }
    case 'favorite':
      return { ...base, status: 'seen', suggestedRating: FAVORITE_RATING, queuedAt: now, favorite: true }
  }
}

/** Unswiped media in catalog order first, then skipped ones, oldest skip first. */
export function buildDeck(order: string[], entries: Map<string, Entry>): string[] {
  const fresh: string[] = []
  const skipped: Entry[] = []
  for (const id of order) {
    const e = entries.get(id)
    if (!e) fresh.push(id)
    else if (e.status === 'skip') skipped.push(e)
  }
  skipped.sort((a, b) => (a.skippedAt ?? 0) - (b.skippedAt ?? 0))
  return [...fresh, ...skipped.map((e) => e.mediaId)]
}

export function countFresh(order: string[], entries: Map<string, Entry>): number {
  let n = 0
  for (const id of order) if (!entries.has(id)) n++
  return n
}

export function rateQueue(entries: Map<string, Entry>): Entry[] {
  return [...entries.values()]
    .filter((e) => e.status === 'seen' && e.rating === null)
    .sort((a, b) => (a.queuedAt ?? a.updatedAt) - (b.queuedAt ?? b.updatedAt))
}

export function ratedList(entries: Map<string, Entry>): Entry[] {
  return [...entries.values()]
    .filter((e) => e.status === 'seen' && e.rating !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Entries with a given status, most recent first (Lists tab). */
export function statusList(entries: Map<string, Entry>, status: Entry['status']): Entry[] {
  return [...entries.values()].filter((e) => e.status === status).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function favoriteList(entries: Map<string, Entry>): Entry[] {
  return [...entries.values()].filter((e) => e.favorite).sort((a, b) => b.updatedAt - a.updatedAt)
}
