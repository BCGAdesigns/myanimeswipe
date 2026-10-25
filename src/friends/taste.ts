// Taste test: two friends rate the same titles from 1 to 8, each on their own device, and guess
// the rating the other one gives. Nobody sees the other's answers until both finish; the result
// shows how close their tastes are and who knows the other better.
import { signalWeight } from '../recs/engine'
import type { Entry, Media } from '../types'
import { asEntry, mediaSnapshot, type SharedEntry } from './compare'

export interface TestItem {
  mediaId: string
  media: Media
}

export interface TestAnswer {
  /** The person's own rating, 1 to 8; null when they have not seen it. */
  rating: number | null
  /** The rating they think the other person gives; null for "não viu". */
  guess: number | null
}

export type Answers = Record<string, TestAnswer>

export const TEST_SIZE = 8

/** Ratings worth the same distance apart as the friend compatibility: 3 or more is no agreement. */
const GAP_SCALE = 3

/** The first tests used words; they map onto the 1 to 8 scale. */
const OLD_OPINION: Record<string, number | null> = { love: 8, like: 6, meh: 4, dislike: 2, unseen: null }

const asRating = (v: unknown): number | null | undefined => {
  if (v === null) return null
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 8) return v
  if (typeof v === 'string' && v in OLD_OPINION) return OLD_OPINION[v]
  return undefined
}

/** Keeps only well formed answers; answers from the first versions are converted. */
export function parseAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Answers = {}
  for (const [id, a] of Object.entries(raw as Record<string, unknown>)) {
    const answer = a as { rating?: unknown; guess?: unknown; opinion?: unknown } | null
    if (!answer) continue
    const rating = asRating('rating' in answer ? answer.rating : answer.opinion)
    const guess = asRating(answer.guess)
    if (rating === undefined) continue
    out[id] = { rating, guess: guess === undefined ? null : guess }
  }
  return out
}

export function parseItems(raw: unknown): TestItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x): TestItem[] => {
    const item = x as { mediaId?: unknown; media?: Media | null }
    const m = item?.media
    if (typeof item?.mediaId !== 'string' || !m || typeof m.title !== 'string') return []
    return [{ mediaId: item.mediaId, media: { ...m, tags: [], genres: m.genres ?? [] } }]
  })
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Someone has an opinion about it: seen, watching or dropped. */
const known = (status: Entry['status']) => status === 'seen' || status === 'watching' || status === 'dropped'

/**
 * Picks the questions: titles both know, titles only the friend knows and titles only the user
 * knows, so each side also meets the other's favorites. Strong opinions come first; the rest of
 * the order is random.
 */
export function pickTestItems(
  mine: Map<string, Entry>,
  myMedia: Map<string, Media>,
  theirs: SharedEntry[],
  random: () => number = Math.random,
  size = TEST_SIZE,
): TestItem[] {
  const theirMap = new Map(theirs.map((s) => [s.mediaId, s]))
  const pools = { both: [] as TestItem[], theirs: [] as TestItem[], mine: [] as TestItem[] }
  const strength = new Map<string, number>()

  for (const s of theirs) {
    if (!known(s.status)) continue
    const m = myMedia.get(s.mediaId) ?? s.media
    if (!m) continue
    const my = mine.get(s.mediaId)
    const item = { mediaId: s.mediaId, media: mediaSnapshot(m) }
    strength.set(s.mediaId, Math.abs(signalWeight(asEntry(s))) + (my ? Math.abs(signalWeight(my)) : 0))
    if (my && known(my.status)) pools.both.push(item)
    else pools.theirs.push(item)
  }
  for (const e of mine.values()) {
    if (!known(e.status) || theirMap.has(e.mediaId)) continue
    const m = myMedia.get(e.mediaId)
    if (!m) continue
    strength.set(e.mediaId, Math.abs(signalWeight(e)))
    pools.mine.push({ mediaId: e.mediaId, media: mediaSnapshot(m) })
  }

  // Shuffle, then let strong opinions rise: the top half of each pool by strength, in random order.
  const prepared = (list: TestItem[]) => {
    const mixed = shuffle(list, random)
    mixed.sort((a, b) => (strength.get(b.mediaId) ?? 0) - (strength.get(a.mediaId) ?? 0))
    return shuffle(mixed.slice(0, Math.max(size, Math.ceil(mixed.length / 2))), random)
  }
  const both = prepared(pools.both)
  const theirsOnly = prepared(pools.theirs)
  const mineOnly = prepared(pools.mine)

  const picked: TestItem[] = []
  const take = (list: TestItem[], n: number) => {
    while (n-- > 0 && list.length && picked.length < size) picked.push(list.shift()!)
  }
  const third = Math.ceil(size / 3)
  take(both, third)
  take(theirsOnly, third)
  take(mineOnly, size - picked.length)
  // One pool was short: fill from the others.
  take(both, size)
  take(theirsOnly, size)
  take(mineOnly, size)
  return shuffle(picked, random)
}

export type Closeness = 'same' | 'close' | 'apart'

/** Same rating, one apart, or further (or seen against not seen). */
export function closeness(a: number | null, b: number | null): Closeness {
  if (a === null || b === null) return a === b ? 'same' : 'apart'
  const gap = Math.abs(a - b)
  return gap === 0 ? 'same' : gap === 1 ? 'close' : 'apart'
}

export interface ItemResult {
  item: TestItem
  mine: TestAnswer | null
  theirs: TestAnswer | null
  /** How close the two ratings are; null unless both rated it. */
  taste: Closeness | null
  /** The user's guess against the friend's rating, and the friend's guess against the user's. */
  myGuess: Closeness | null
  theirGuess: Closeness | null
}

export interface TestScore {
  /** 0 to 100 over the titles both rated; null when there is none. */
  taste: number | null
  bothRated: number
  sameRating: number
  /** Exact guesses ("não viu" included), out of `total`. */
  myRight: number
  theirRight: number
  total: number
  items: ItemResult[]
}

export function scoreTest(items: TestItem[], mine: Answers, theirs: Answers): TestScore {
  let tasteSum = 0
  let bothRated = 0
  let sameRating = 0
  let myRight = 0
  let theirRight = 0
  let total = 0
  const results = items.map((item): ItemResult => {
    const a = mine[item.mediaId] ?? null
    const b = theirs[item.mediaId] ?? null
    if (!a || !b) return { item, mine: a, theirs: b, taste: null, myGuess: null, theirGuess: null }
    total++
    let taste: Closeness | null = null
    if (a.rating !== null && b.rating !== null) {
      const gap = Math.abs(a.rating - b.rating)
      bothRated++
      tasteSum += Math.max(0, 1 - gap / GAP_SCALE)
      if (gap === 0) sameRating++
      taste = closeness(a.rating, b.rating)
    }
    const myGuess = closeness(a.guess, b.rating)
    const theirGuess = closeness(b.guess, a.rating)
    if (myGuess === 'same') myRight++
    if (theirGuess === 'same') theirRight++
    return { item, mine: a, theirs: b, taste, myGuess, theirGuess }
  })
  return {
    taste: bothRated ? Math.round((100 * tasteSum) / bothRated) : null,
    bothRated,
    sameRating,
    myRight,
    theirRight,
    total,
    items: results,
  }
}
