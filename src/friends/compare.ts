// Taste comparison between the user and a friend's shared list ("Match com amigos").
import { POSITIVE, signalWeight } from '../recs/engine'
import type { Entry, EntryStatus, Media } from '../types'

export interface SharedEntry {
  mediaId: string
  status: EntryStatus
  rating: number | null
  suggestedRating: number | null
  favorite: boolean
  media: Media | null
}

export interface SharedList {
  name: string | null
  entries: SharedEntry[]
}

export interface Comparison {
  /** 0 to 100, or null with too little in common to say. */
  compatibility: number | null
  /** Titles both have any record of. */
  common: number
  bothWant: string[]
  bothLoved: string[]
  /** They loved it; the user hasn't seen it. */
  theyRecommend: string[]
  /** The user loved it; they haven't seen it. */
  youRecommend: string[]
  disagree: string[]
  /** Card data for every id above (the user's copy first, else the friend's snapshot). */
  media: Map<string, Media>
}

/** Fewer shared signals than this and a percentage would be noise. */
const MIN_BASIS = 3
const STATUSES: EntryStatus[] = ['want', 'reject', 'skip', 'seen', 'watching', 'paused', 'dropped']

const asEntry = (s: SharedEntry): Entry => ({
  mediaId: s.mediaId,
  status: s.status,
  rating: s.rating,
  suggestedRating: s.suggestedRating,
  favorite: s.favorite,
  via: 'friend',
  updatedAt: 0,
})

/** Validates what came back from the server before trusting its shape. */
export function parseSharedList(raw: unknown): SharedList | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { name?: unknown; entries?: unknown }
  const entries = Array.isArray(obj.entries) ? obj.entries : []
  const num = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 10 ? v : null)
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : null,
    entries: entries.flatMap((x): SharedEntry[] => {
      const e = x as Record<string, unknown>
      if (typeof e.mediaId !== 'string' || !STATUSES.includes(e.status as EntryStatus)) return []
      const m = e.media as Media | null
      return [
        {
          mediaId: e.mediaId,
          status: e.status as EntryStatus,
          rating: num(e.rating),
          suggestedRating: num(e.suggestedRating),
          favorite: e.favorite === true,
          media: m && typeof m === 'object' && typeof m.title === 'string' ? { ...m, tags: m.tags ?? [], genres: m.genres ?? [] } : null,
        },
      ]
    }),
  }
}

export function compareLists(mine: Map<string, Entry>, myMedia: Map<string, Media>, theirs: SharedList): Comparison {
  const media = new Map<string, Media>()
  const sections = { bothWant: [], bothLoved: [], theyRecommend: [], youRecommend: [], disagree: [] } as Record<
    'bothWant' | 'bothLoved' | 'theyRecommend' | 'youRecommend' | 'disagree',
    { id: string; weight: number }[]
  >
  const theirMap = new Map(theirs.entries.map((s) => [s.mediaId, s]))
  let common = 0
  let ratedPairs = 0
  let ratingGap = 0
  let signalPairs = 0
  let agreements = 0

  const remember = (id: string, snapshot: Media | null) => {
    const m = myMedia.get(id) ?? snapshot
    if (m) media.set(id, m)
    return !!m
  }
  const unseenOrWanted = (e: Entry | undefined) => !e || e.status === 'want' || e.status === 'skip'

  for (const s of theirs.entries) {
    const their = asEntry(s)
    const tw = signalWeight(their)
    const my = mine.get(s.mediaId)
    const known = remember(s.mediaId, s.media)
    if (!known) continue
    if (my && my.status !== 'skip') {
      common++
      const mw = signalWeight(my)
      const mr = my.status === 'seen' ? (my.rating ?? my.suggestedRating) : null
      const tr = their.status === 'seen' ? (their.rating ?? their.suggestedRating) : null
      if (mr !== null && tr !== null) {
        ratedPairs++
        ratingGap += Math.abs(mr - tr)
      }
      if (Math.abs(mw) >= POSITIVE && Math.abs(tw) >= POSITIVE) {
        signalPairs++
        if (Math.sign(mw) === Math.sign(tw)) agreements++
      }
      if (my.status === 'want' && their.status === 'want') sections.bothWant.push({ id: s.mediaId, weight: 1 })
      if (mw >= POSITIVE && tw >= POSITIVE) sections.bothLoved.push({ id: s.mediaId, weight: mw + tw })
      if ((mw >= POSITIVE && tw <= -POSITIVE) || (mw <= -POSITIVE && tw >= POSITIVE)) {
        sections.disagree.push({ id: s.mediaId, weight: Math.abs(mw - tw) })
      }
    }
    if (tw >= POSITIVE && unseenOrWanted(my)) sections.theyRecommend.push({ id: s.mediaId, weight: tw })
  }

  for (const my of mine.values()) {
    const mw = signalWeight(my)
    if (mw < POSITIVE) continue
    const their = theirMap.get(my.mediaId)
    if (their && their.status !== 'want') continue
    if (remember(my.mediaId, their?.media ?? null)) sections.youRecommend.push({ id: my.mediaId, weight: mw })
  }

  const ordered = (list: { id: string; weight: number }[]) =>
    list.sort((a, b) => b.weight - a.weight).map((x) => x.id)

  let compatibility: number | null = null
  if (ratedPairs >= MIN_BASIS) compatibility = Math.round(100 * (1 - ratingGap / ratedPairs / 10))
  else if (signalPairs >= MIN_BASIS) compatibility = Math.round((100 * agreements) / signalPairs)

  return {
    compatibility,
    common,
    bothWant: ordered(sections.bothWant),
    bothLoved: ordered(sections.bothLoved),
    theyRecommend: ordered(sections.theyRecommend),
    youRecommend: ordered(sections.youRecommend),
    disagree: ordered(sections.disagree),
    media,
  }
}
