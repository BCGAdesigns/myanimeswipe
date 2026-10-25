// Taste comparison with a friend: compatibility from the ratings both gave, every title in
// common side by side, and suggestions in each direction ranked by how much the recommender
// liked the title and how well it fits the other person's genres.
import { contentScore, POSITIVE, signalWeight, tasteProfile } from '../recs/engine'
import type { Entry, EntryStatus, Media } from '../types'

export interface SharedEntry {
  mediaId: string
  status: EntryStatus
  rating: number | null
  suggestedRating: number | null
  favorite: boolean
  /** When the friend last changed it (ms); 0 when unknown. */
  updatedAt: number
  media: Media | null
}

export interface SharedList {
  name: string | null
  entries: SharedEntry[]
}

/** One person's take on a title. */
export interface Take {
  status: EntryStatus
  /** The confirmed rating, else the suggested one; only for seen titles. */
  rating: number | null
  favorite: boolean
}

export interface CommonTitle {
  id: string
  mine: Take
  theirs: Take
  /** Rating difference when both rated it. */
  gap: number | null
  /** The friend's last change (ms). */
  updatedAt: number
}

export interface Suggestion {
  id: string
  /** What the person suggesting it thinks of it. */
  take: Take
  /** 0 to 1: how well its genres fit the other person's taste (0.5 = no information). */
  fit: number
}

export interface Comparison {
  /** 0 to 100, or null with too little in common to say. */
  compatibility: number | null
  /** Titles both rated, and how far apart the ratings are on average. */
  ratedTogether: number
  meanGap: number | null
  sameRating: number
  /** Every title both have a record of (skipped cards aside). */
  common: CommonTitle[]
  bothWant: string[]
  bothWatching: string[]
  bothLoved: string[]
  disagree: CommonTitle[]
  /** They liked it and the user has not seen it. */
  theyRecommend: Suggestion[]
  /** The user liked it and they have no record of it. */
  youRecommend: Suggestion[]
  /** On their Quero ver list and already seen by the user, who can tell them. */
  youCanTell: Suggestion[]
  /** Card data for every id above (the user's copy first, else the friend's snapshot). */
  media: Map<string, Media>
}

export type CommonOrder = 'similar' | 'different' | 'mine' | 'theirs' | 'recent'

export const COMMON_ORDER_LABELS: Record<CommonOrder, string> = {
  similar: 'Mais parecidas',
  different: 'Mais diferentes',
  mine: 'Minha maior nota',
  theirs: 'Maior nota do amigo',
  recent: 'Mais recentes',
}

/** Ratings this many points apart count as no agreement at all. */
const GAP_SCALE = 4
/** Evidence worth this many titles pulls the score toward 50% while there is little in common. */
const PRIOR = 2
/** Below this much evidence a percentage would be noise. */
const MIN_EVIDENCE = 2
/** A rating of 8 or a favorite. */
const LOVED = 1.25
const DISAGREE_GAP = 4

const STATUSES: EntryStatus[] = ['want', 'reject', 'skip', 'seen', 'watching', 'paused', 'dropped']

export function takeOf(e: { status: EntryStatus; rating: number | null; suggestedRating: number | null; favorite?: boolean }): Take {
  return {
    status: e.status,
    rating: e.status === 'seen' ? (e.rating ?? e.suggestedRating) : null,
    favorite: e.favorite === true,
  }
}

export const asEntry = (s: SharedEntry): Entry => ({
  mediaId: s.mediaId,
  status: s.status,
  rating: s.rating,
  suggestedRating: s.suggestedRating,
  favorite: s.favorite,
  via: 'friend',
  updatedAt: s.updatedAt,
})

/** Card data that travels to other people: without the long fields, like the cloud copies. */
export function mediaSnapshot(m: Media): Media {
  const { synopsis: _synopsis, tags: _tags, ...rest } = m
  return { ...rest, tags: [] }
}

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
          updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0,
          media: m && typeof m === 'object' && typeof m.title === 'string' ? { ...m, tags: m.tags ?? [], genres: m.genres ?? [] } : null,
        },
      ]
    }),
  }
}

const ranked = <T extends { score: number }>(list: T[]) => list.sort((a, b) => b.score - a.score)
const strip = ({ score: _score, ...rest }: Suggestion & { score: number }): Suggestion => rest

export function compareLists(mine: Map<string, Entry>, myMedia: Map<string, Media>, theirs: SharedList): Comparison {
  const media = new Map<string, Media>()
  const remember = (id: string, snapshot: Media | null) => {
    const m = myMedia.get(id) ?? snapshot
    if (m) media.set(id, m)
    return m ?? null
  }
  const theirMap = new Map(theirs.entries.map((s) => [s.mediaId, s]))
  const theirMedia = new Map(theirs.entries.flatMap((s) => (s.media ? [[s.mediaId, s.media] as const] : [])))
  const myProfile = tasteProfile(mine.values(), myMedia)
  const theirProfile = tasteProfile(theirs.entries.map(asEntry), theirMedia)

  const common: CommonTitle[] = []
  const bothWant: { id: string; score: number }[] = []
  const bothWatching: { id: string; score: number }[] = []
  const bothLoved: { id: string; score: number }[] = []
  const disagree: (CommonTitle & { score: number })[] = []
  const theyRecommend: (Suggestion & { score: number })[] = []
  const youCanTell: (Suggestion & { score: number })[] = []
  let evidence = 0
  let agreement = 0
  let gapSum = 0
  let sameRating = 0

  for (const s of theirs.entries) {
    const m = remember(s.mediaId, s.media)
    if (!m) continue
    const theirTake = takeOf(s)
    const tw = signalWeight(asEntry(s))
    const my = mine.get(s.mediaId)

    if (!my || my.status === 'skip' || my.status === 'want') {
      // Unseen by the user (a Quero ver entry included): worth suggesting if they liked it.
      if (tw >= POSITIVE) {
        const fit = contentScore(m, myProfile)
        theyRecommend.push({ id: s.mediaId, take: theirTake, fit, score: tw * (0.5 + fit) })
      }
    }
    if (!my || my.status === 'skip') continue

    const myTake = takeOf(my)
    const mw = signalWeight(my)
    const gap = myTake.rating !== null && theirTake.rating !== null ? Math.abs(myTake.rating - theirTake.rating) : null
    const row: CommonTitle = { id: s.mediaId, mine: myTake, theirs: theirTake, gap, updatedAt: s.updatedAt }
    common.push(row)

    if (gap !== null) {
      evidence += 1
      agreement += Math.max(0, 1 - gap / GAP_SCALE)
      gapSum += gap
      if (gap === 0) sameRating++
    } else if (Math.abs(mw) >= POSITIVE && Math.abs(tw) >= POSITIVE) {
      // A strong opinion on both sides without two ratings (a favorite against a drop) counts half.
      evidence += 0.5
      if (Math.sign(mw) === Math.sign(tw)) agreement += 0.5
    }

    const quality = m.score ?? 0
    if (my.status === 'want' && s.status === 'want') bothWant.push({ id: s.mediaId, score: quality })
    if (my.status === 'watching' && s.status === 'watching') bothWatching.push({ id: s.mediaId, score: quality })
    if (mw >= LOVED && tw >= LOVED) bothLoved.push({ id: s.mediaId, score: mw + tw })
    const opposite = Math.abs(mw) >= POSITIVE && Math.abs(tw) >= POSITIVE && Math.sign(mw) !== Math.sign(tw)
    if ((gap !== null && gap >= DISAGREE_GAP) || (gap === null && opposite)) {
      disagree.push({ ...row, score: gap ?? Math.abs(mw - tw) * 2 })
    }
    if (s.status === 'want' && (my.status === 'seen' || my.status === 'dropped')) {
      youCanTell.push({ id: s.mediaId, take: myTake, fit: contentScore(m, theirProfile), score: myTake.rating ?? -1 })
    }
  }

  const youRecommend: (Suggestion & { score: number })[] = []
  for (const my of mine.values()) {
    const mw = signalWeight(my)
    if (mw < POSITIVE || theirMap.has(my.mediaId)) continue
    const m = remember(my.mediaId, null)
    if (!m) continue
    const fit = contentScore(m, theirProfile)
    youRecommend.push({ id: my.mediaId, take: takeOf(my), fit, score: mw * (0.5 + fit) })
  }

  const ratedTogether = common.filter((c) => c.gap !== null).length
  return {
    compatibility: evidence >= MIN_EVIDENCE ? Math.round((100 * (agreement + PRIOR / 2)) / (evidence + PRIOR)) : null,
    ratedTogether,
    meanGap: ratedTogether ? gapSum / ratedTogether : null,
    sameRating,
    common: sortCommon(common, 'similar'),
    bothWant: ranked(bothWant).map((x) => x.id),
    bothWatching: ranked(bothWatching).map((x) => x.id),
    bothLoved: ranked(bothLoved).map((x) => x.id),
    disagree: ranked(disagree).map(({ score: _score, ...row }) => row),
    theyRecommend: ranked(theyRecommend).map(strip),
    youRecommend: ranked(youRecommend).map(strip),
    youCanTell: ranked(youCanTell).map(strip),
    media,
  }
}

/** Ratings first in every order; titles without two ratings go last, newest first. */
export function sortCommon(list: CommonTitle[], order: CommonOrder): CommonTitle[] {
  const rated = (c: CommonTitle) => (c.gap === null ? 1 : 0)
  const mineR = (c: CommonTitle) => c.mine.rating ?? -1
  const theirsR = (c: CommonTitle) => c.theirs.rating ?? -1
  return [...list].sort((a, b) => {
    if (order === 'recent') return b.updatedAt - a.updatedAt
    const byRated = rated(a) - rated(b)
    if (byRated) return byRated
    if (a.gap === null || b.gap === null) return b.updatedAt - a.updatedAt
    switch (order) {
      case 'similar':
        return a.gap - b.gap || mineR(b) + theirsR(b) - (mineR(a) + theirsR(a))
      case 'different':
        return b.gap - a.gap || b.updatedAt - a.updatedAt
      case 'mine':
        return mineR(b) - mineR(a) || theirsR(b) - theirsR(a)
      case 'theirs':
        return theirsR(b) - theirsR(a) || mineR(b) - mineR(a)
    }
  })
}

export interface FriendStats {
  seen: number
  rated: number
  average: number | null
  favorites: number
  want: number
  watching: number
}

/** Numbers for a profile header. */
export function listStats(entries: { status: EntryStatus; rating: number | null; suggestedRating: number | null; favorite?: boolean }[]): FriendStats {
  let seen = 0
  let rated = 0
  let sum = 0
  let favorites = 0
  let want = 0
  let watching = 0
  for (const e of entries) {
    if (e.favorite) favorites++
    if (e.status === 'want') want++
    if (e.status === 'watching') watching++
    if (e.status !== 'seen') continue
    seen++
    const r = e.rating ?? e.suggestedRating
    if (r !== null) {
      rated++
      sum += r
    }
  }
  return { seen, rated, average: rated ? sum / rated : null, favorites, want, watching }
}
