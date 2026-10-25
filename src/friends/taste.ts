// Taste test: two friends answer the same titles, each with their own opinion and a guess of
// the other's. The result says how close their tastes are and how well each one knows the other.
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
  /** What the person thinks the other one will answer. */
  guess: Opinion
}

export type Answers = Record<string, TestAnswer>

export const TEST_SIZE = 8

const isOpinion = (v: unknown): v is Opinion => OPINIONS.some((o) => o.id === v)

/** Keeps only well formed answers. */
export function parseAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Answers = {}
  for (const [id, a] of Object.entries(raw as Record<string, unknown>)) {
    const answer = a as { opinion?: unknown; guess?: unknown } | null
    if (answer && isOpinion(answer.opinion) && isOpinion(answer.guess)) out[id] = { opinion: answer.opinion, guess: answer.guess }
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
 * Picks the questions: titles both know (to compare), titles only the friend knows (to guess
 * their opinion) and titles only the user knows (so the friend guesses theirs). Strong opinions
 * come first so the guesses mean something; the rest of the order is random.
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

export interface ItemResult {
  item: TestItem
  mine: TestAnswer | null
  theirs: TestAnswer | null
  /** Did the user guess the friend's opinion, and the friend the user's? Null without both answers. */
  iGuessed: 'right' | 'close' | 'wrong' | null
  theyGuessed: 'right' | 'close' | 'wrong' | null
}

export interface TestScore {
  /** 0 to 100 over the titles both have seen; null when there is none. */
  taste: number | null
  tasteBasis: number
  myGuesses: number
  theirGuesses: number
  total: number
  items: ItemResult[]
}

function guessResult(guess: Opinion, actual: Opinion): 'right' | 'close' | 'wrong' {
  if (guess === actual) return 'right'
  if (guess === 'unseen' || actual === 'unseen') return 'wrong'
  return Math.abs(LEVEL[guess] - LEVEL[actual]) === 1 ? 'close' : 'wrong'
}

export function scoreTest(items: TestItem[], mine: Answers, theirs: Answers): TestScore {
  let tasteSum = 0
  let tasteBasis = 0
  let myGuesses = 0
  let theirGuesses = 0
  const results = items.map((item): ItemResult => {
    const a = mine[item.mediaId] ?? null
    const b = theirs[item.mediaId] ?? null
    if (!a || !b) return { item, mine: a, theirs: b, iGuessed: null, theyGuessed: null }
    if (a.opinion !== 'unseen' && b.opinion !== 'unseen') {
      tasteBasis++
      tasteSum += 1 - Math.abs(LEVEL[a.opinion] - LEVEL[b.opinion]) / 3
    }
    const iGuessed = guessResult(a.guess, b.opinion)
    const theyGuessed = guessResult(b.guess, a.opinion)
    if (iGuessed === 'right') myGuesses++
    if (theyGuessed === 'right') theirGuesses++
    return { item, mine: a, theirs: b, iGuessed, theyGuessed }
  })
  return {
    taste: tasteBasis ? Math.round((100 * tasteSum) / tasteBasis) : null,
    tasteBasis,
    myGuesses,
    theirGuesses,
    total: items.length,
    items: results,
  }
}
