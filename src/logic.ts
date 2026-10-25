import type { Entry, SwipeAction } from './types'

export const LIKED_RATING = 8
export const DISLIKED_RATING = 3

/** Minimum drag distance in px before a release counts as a swipe. */
export const SWIPE_THRESHOLD = 90

/**
 * Maps a drag vector to one of the six actions. Angles are measured with
 * up as positive: the right side is split in three 45° sectors (liked, seen,
 * disliked), up and down get 67.5° each, and the whole left side is skip.
 */
export function classifySwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD): SwipeAction | null {
  if (Math.hypot(dx, dy) < threshold) return null
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI
  if (angle >= -22.5 && angle <= 22.5) return 'seen'
  if (angle > 22.5 && angle <= 67.5) return 'liked'
  if (angle < -22.5 && angle >= -67.5) return 'disliked'
  if (angle > 67.5 && angle <= 135) return 'want'
  if (angle < -67.5 && angle >= -135) return 'reject'
  return 'skip'
}

/** Rating tab only knows two gestures: right confirms, left skips. */
export function classifyRateSwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD): 'confirm' | 'skip' | null {
  if (Math.hypot(dx, dy) < threshold) return null
  const angle = Math.abs((Math.atan2(-dy, dx) * 180) / Math.PI)
  if (angle <= 67.5) return 'confirm'
  if (angle >= 112.5) return 'skip'
  return null
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
      return { ...base, status: action }
    case 'skip':
      return { ...base, status: 'skip', skippedAt: now }
    case 'seen':
      return { ...base, status: 'seen', queuedAt: now }
    case 'liked':
      return { ...base, status: 'seen', suggestedRating: LIKED_RATING, queuedAt: now }
    case 'disliked':
      return { ...base, status: 'seen', suggestedRating: DISLIKED_RATING, queuedAt: now }
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
