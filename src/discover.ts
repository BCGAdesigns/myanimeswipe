// Order of the Descobrir deck: the catalog's own order at first; once the app knows the user's
// taste, what matches it comes first. The user can switch to a shuffle instead.
import type { DiscoverOrder } from './prefs'
import { contentScore } from './recs/engine'
import type { Media } from './types'

/** Classified titles (skips included) before Descobrir follows the user's taste. */
export const PERSONALIZE_AFTER = 50
/** Weight of the catalog position next to taste (-1 to 1); tuned by hand, not learned. */
const W_RANK = 0.5

export type DeckMode = 'catalog' | 'taste' | 'random'

export function deckMode(order: DiscoverOrder, classified: number): DeckMode {
  if (order === 'random') return 'random'
  return classified >= PERSONALIZE_AFTER ? 'taste' : 'catalog'
}

/**
 * Taste first: how well genres and tags match what the user liked and disliked (-1 to 1), plus
 * up to half a point for coming early in the catalog, so popular or recent titles still show.
 */
export function byTaste(media: Map<string, Media>, profile: Map<string, number>) {
  return (ids: string[]): string[] => {
    const last = Math.max(1, ids.length - 1)
    const score = new Map(
      ids.map((id, i) => {
        const m = media.get(id)
        const taste = m ? contentScore(m, profile) * 2 - 1 : 0
        return [id, taste + W_RANK * (1 - i / last)]
      }),
    )
    return [...ids].sort((a, b) => score.get(b)! - score.get(a)!)
  }
}

/**
 * FNV-1a plus the MurmurHash3 finalizer, so each title gets a fixed place in the shuffle of the
 * visit. FNV alone keeps ids that differ in the last digit close together (runs like 4, 5, 6, 7).
 */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Shuffle that keeps its order while titles come and go; a new seed (a new visit) deals again. */
export function shuffled(seed: number) {
  return (ids: string[]): string[] => {
    const key = new Map(ids.map((id) => [id, hash(`${seed}:${id}`)]))
    return [...ids].sort((a, b) => key.get(a)! - key.get(b)!)
  }
}

/** The cards already on screen stay where they are (top first); a new order only moves the ones behind. */
export function keepHead(order: string[], head: string[]): string[] {
  const present = new Set(order)
  const kept = [...new Set(head)].filter((id) => present.has(id))
  if (!kept.length) return order
  const pinned = new Set(kept)
  return [...kept, ...order.filter((id) => !pinned.has(id))]
}
