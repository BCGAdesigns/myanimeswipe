// Taste test: two friends say what they thought of the same titles, each on their own device.
// Nobody sees the other's answers until both finish; the result shows how close their tastes are.
import { signalWeight } from '../recs/engine'
import type { Entry, Media } from '../types'
import { asEntry, mediaSnapshot, type SharedEntry } from './compare'

export type Opinion = 'love' | 'like' | 'meh' | 'dislike' | 'unseen'

export const OPINIONS: { id: Opinion; label: string }[] = [
  { id: 'love', label: 'Amei' },
  { id: 'like', label: 'Gostei' },
  { id: 'meh', label: 'Mais ou menos' },
  { id: 'dislike', label: 'Não gostei' },
  { id: 'unseen', label: 'Não vi' },
]

export const OPINION_LABEL = Object.fromEntries(OPINIONS.map((o) => [o.id, o.label])) as Record<Opinion, string>

const LEVEL: Record<Exclude<Opinion, 'unseen'>, number> = { love: 3, like: 2, meh: 1, dislike: 0 }

export interface TestItem {
  mediaId: string
  media: Media
}

export interface TestAnswer {
  opinion: Opinion
}

export type Answers = Record<string, TestAnswer>

export const TEST_SIZE = 8

const isOpinion = (v: unknown): v is Opinion => OPINIONS.some((o) => o.id === v)

/** Keeps only well formed answers (tests from the first version also carried a guess, now ignored). */
export function parseAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Answers = {}
  for (const [id, a] of Object.entries(raw as Record<string, unknown>)) {
    const answer = a as { opinion?: unknown } | null
    if (answer && isOpinion(answer.opinion)) out[id] = { opinion: answer.opinion }
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

export interface ItemResult {
  item: TestItem
  mine: Opinion | null
  theirs: Opinion | null
  /** How close the two opinions are; null unless both saw it. */
  closeness: Closeness | null
}

export interface TestScore {
  /** 0 to 100 over the titles both have seen; null when there is none. */
  taste: number | null
  /** Titles both have seen, and how many of those got the same answer. */
  bothSeen: number
  same: number
  items: ItemResult[]
}

export function scoreTest(items: TestItem[], mine: Answers, theirs: Answers): TestScore {
  let tasteSum = 0
  let bothSeen = 0
  let same = 0
  const results = items.map((item): ItemResult => {
    const a = mine[item.mediaId]?.opinion ?? null
    const b = theirs[item.mediaId]?.opinion ?? null
    if (!a || !b || a === 'unseen' || b === 'unseen') return { item, mine: a, theirs: b, closeness: null }
    const gap = Math.abs(LEVEL[a] - LEVEL[b])
    bothSeen++
    tasteSum += 1 - gap / 3
    if (gap === 0) same++
    return { item, mine: a, theirs: b, closeness: gap === 0 ? 'same' : gap === 1 ? 'close' : 'apart' }
  })
  return { taste: bothSeen ? Math.round((100 * tasteSum) / bothSeen) : null, bothSeen, same, items: results }
}
