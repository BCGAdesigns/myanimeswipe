// Phase 2 recommender, no AI: community "watch next" lists (AniList votes, TMDB recommendations)
// seeded by what the user liked, blended with a genre and tag taste profile and the title's score.
import { filterHash, type Preferences } from '../prefs'
import type { Recommendation } from '../sources/anilist'
import { passesFilters } from '../sources/catalog'
import { anilistSites } from '../sources/providers'
import type { TmdbType } from '../sources/tmdb'
import type { Entry, Media } from '../types'

export interface RecsCache {
  /** Ranked media ids, best first. */
  ids: string[]
  /** Why each title is there, shown on its card. */
  reasons: Record<string, string>
  builtAt: number
  /** Seeds the list came from; new strong signals make it worth rebuilding. */
  seedKey: string
  /** Kinds and filters it was built for. */
  prefsKey: string
}

export interface RecsFetchers {
  anime: (sourceIds: number[]) => Promise<Map<number, Recommendation[]>>
  tmdb: (type: TmdbType, id: number) => Promise<Media[]>
}

/** Signals at or above this weight seed recommendations (rated 7 or more, liked, watching, favorite). */
export const POSITIVE = 0.75
export const MIN_POSITIVE_SIGNALS = 3
const MAX_ANIME_SEEDS = 20
/** One TMDB request per seed. */
const MAX_TMDB_SEEDS = 8
/** AniList answered 10 seeds per request without complexity errors (checked live). */
const ANIME_BATCH = 10
const MAX_RECS = 120
const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Blend of the three scores; tuned by hand, not learned. */
const W_COLLAB = 0.6
const W_CONTENT = 0.3
const W_QUALITY = 0.1
/** Tags below this rank are side notes, not what the title is about. */
const TAG_RANK = 60

interface Seed {
  entry: Entry
  media: Media
  weight: number
}

/** What an entry says about the user's taste: -2.75 (rated 0) to +3 (favorite). */
export function signalWeight(e: Entry): number {
  if (e.favorite) return 3
  switch (e.status) {
    case 'seen': {
      const r = e.rating ?? e.suggestedRating
      return r === null ? 0.3 : (r - 5.5) / 2
    }
    case 'watching':
      return 1
    case 'want':
      return 0.5
    case 'paused':
      return 0.2
    case 'dropped':
      return -1
    case 'reject':
      return -0.75
    case 'skip':
      return 0
  }
}

export function prefsKeyOf(prefs: Preferences): string {
  return `${[...prefs.kinds].sort().join(',')}|${filterHash(prefs)}`
}

/** Strongest positive signals among the kinds the user wants, most recent first on ties. */
export function pickSeeds(entries: Map<string, Entry>, media: Map<string, Media>, prefs: Preferences) {
  const seeds: Seed[] = []
  for (const entry of entries.values()) {
    const weight = signalWeight(entry)
    const m = media.get(entry.mediaId)
    if (weight >= POSITIVE && m && prefs.kinds.includes(m.kind)) seeds.push({ entry, media: m, weight })
  }
  seeds.sort((a, b) => b.weight - a.weight || (b.entry.rev ?? b.entry.updatedAt) - (a.entry.rev ?? a.entry.updatedAt))
  return {
    all: seeds,
    anime: seeds.filter((s) => s.media.source === 'anilist').slice(0, MAX_ANIME_SEEDS),
    tmdb: seeds.filter((s) => s.media.source === 'tmdb' && s.media.tmdbType).slice(0, MAX_TMDB_SEEDS),
  }
}

export function seedKeyOf(seeds: ReturnType<typeof pickSeeds>): string {
  return [...seeds.anime, ...seeds.tmdb]
    .map((s) => s.media.id)
    .sort()
    .join(',')
}

/** Genre and tag weights from every signal, scaled to -1..1. */
export function tasteProfile(entries: Iterable<Entry>, media: Map<string, Media>): Map<string, number> {
  const profile = new Map<string, number>()
  const add = (key: string, value: number) => profile.set(key, (profile.get(key) ?? 0) + value)
  for (const e of entries) {
    const w = signalWeight(e)
    const m = media.get(e.mediaId)
    if (!w || !m) continue
    for (const g of m.genres) add(`g:${g}`, w)
    for (const t of m.tags) if (t.rank >= TAG_RANK) add(`t:${t.name}`, (w * t.rank) / 100)
  }
  let max = 0
  for (const v of profile.values()) max = Math.max(max, Math.abs(v))
  if (max > 0) for (const [k, v] of profile) profile.set(k, v / max)
  return profile
}

/** 0..1: how well a title's genres and tags match the profile (0.5 = no information). */
export function contentScore(m: Media, profile: Map<string, number>): number {
  const features = [...m.genres.map((g) => `g:${g}`), ...m.tags.filter((t) => t.rank >= TAG_RANK).map((t) => `t:${t.name}`)]
  if (!features.length) return 0.5
  const sum = features.reduce((s, f) => s + (profile.get(f) ?? 0), 0)
  return (sum / features.length + 1) / 2
}

export function reasonFor(seed: Seed): string {
  const title = seed.media.title
  if (seed.entry.favorite) return `Porque você favoritou ${title}`
  if (seed.entry.status === 'watching') return `Porque você está assistindo ${title}`
  if (seed.entry.rating !== null) return `Porque você deu ${seed.entry.rating} para ${title}`
  return `Porque você curtiu ${title}`
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export function isStale(cache: RecsCache | null, prefs: Preferences, now: number): boolean {
  return !cache || cache.prefsKey !== prefsKeyOf(prefs) || now - cache.builtAt > MAX_AGE_MS
}

export async function buildRecs(
  entries: Map<string, Entry>,
  media: Map<string, Media>,
  prefs: Preferences,
  fetchers: RecsFetchers,
  now = Date.now(),
): Promise<{ cache: RecsCache; media: Media[]; failures: number }> {
  const seeds = pickSeeds(entries, media, prefs)
  const found = new Map<string, { media: Media; collab: number; best: Seed; bestContrib: number }>()
  const add = (m: Media, seed: Seed, contrib: number) => {
    const cur = found.get(m.id)
    if (!cur) found.set(m.id, { media: m, collab: contrib, best: seed, bestContrib: contrib })
    else {
      cur.collab += contrib
      if (contrib > cur.bestContrib) Object.assign(cur, { best: seed, bestContrib: contrib })
    }
  }

  const tasks: Promise<void>[] = []
  if (prefs.kinds.includes('anime')) {
    for (const batch of chunks(seeds.anime, ANIME_BATCH)) {
      tasks.push(
        fetchers.anime(batch.map((s) => s.media.sourceId)).then((bySeed) => {
          for (const seed of batch) {
            const recs = bySeed.get(seed.media.sourceId) ?? []
            const top = Math.log1p(Math.max(1, ...recs.map((r) => r.votes)))
            // The most voted pick gets the seed's full weight, the least voted about half.
            for (const r of recs) add(r.media, seed, seed.weight * (0.5 + (0.5 * Math.log1p(r.votes)) / top))
          }
        }),
      )
    }
  }
  for (const seed of seeds.tmdb) {
    tasks.push(
      fetchers.tmdb(seed.media.tmdbType!, seed.media.sourceId).then((list) => {
        list.forEach((m, i) => add(m, seed, seed.weight * (1 - (0.5 * i) / Math.max(1, list.length - 1))))
      }),
    )
  }
  const settled = await Promise.allSettled(tasks)
  const failed = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (settled.length && failed.length === settled.length) throw failed[0].reason

  const profile = tasteProfile(entries.values(), media)
  const sites = anilistSites(prefs.providers)
  let maxCollab = 0
  for (const f of found.values()) maxCollab = Math.max(maxCollab, f.collab)
  const ranked = [...found.values()]
    .filter((f) => {
      const e = entries.get(f.media.id)
      return (!e || e.status === 'skip') && passesFilters(f.media, prefs, sites)
    })
    .map((f) => ({
      f,
      score:
        W_COLLAB * (maxCollab ? f.collab / maxCollab : 0) +
        W_CONTENT * contentScore(f.media, profile) +
        W_QUALITY * ((f.media.score ?? 60) / 100),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECS)

  return {
    cache: {
      ids: ranked.map((r) => r.f.media.id),
      reasons: Object.fromEntries(ranked.map((r) => [r.f.media.id, reasonFor(r.f.best)])),
      builtAt: now,
      seedKey: seedKeyOf(seeds),
      prefsKey: prefsKeyOf(prefs),
    },
    media: ranked.map((r) => r.f.media),
    failures: failed.length,
  }
}
