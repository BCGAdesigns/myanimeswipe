// Later seasons of the anime in Larguei stay out of Descobrir and Para você. The chains come from
// AniList's SEQUEL relations and stay on this device (any device can look them up again).
import type { Entry } from './types'

/** Later seasons of one anime as media ids, and when AniList was asked. */
export interface SequelChain {
  ids: string[]
  at: number
}

/** By media id of the dropped anime. */
export type SequelChains = Record<string, SequelChain>

/** Requests in a row for one lookup; each goes one season further for every title at once. */
export const MAX_SEQUEL_ROUNDS = 12
/** New seasons get announced: look again after a month. */
export const SEQUEL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const PREFIX = 'anilist:'

export function anilistId(mediaId: string): number | null {
  return mediaId.startsWith(PREFIX) ? Number(mediaId.slice(PREFIX.length)) || null : null
}

/**
 * Follows the sequels season after season for every root at once: each round asks for the next
 * step of all of them in one request. Repeats and cycles are ignored; a root never hides itself.
 */
export async function walkSequels(
  roots: number[],
  directSequels: (ids: number[]) => Promise<Map<number, number[]>>,
  maxRounds = MAX_SEQUEL_ROUNDS,
): Promise<Map<number, number[]>> {
  const chains = new Map(roots.map((root) => [root, new Set<number>()]))
  const known = new Map<number, number[]>()
  let frontier = new Map(roots.map((root) => [root, [root]]))
  for (let round = 0; round < maxRounds && frontier.size; round++) {
    const ask = [...new Set([...frontier.values()].flat())].filter((id) => !known.has(id))
    if (ask.length) {
      const found = await directSequels(ask)
      for (const id of ask) known.set(id, found.get(id) ?? [])
    }
    const next = new Map<number, number[]>()
    for (const [root, ids] of frontier) {
      const chain = chains.get(root)!
      const step = [...new Set(ids.flatMap((id) => known.get(id) ?? []))].filter((id) => id !== root && !chain.has(id))
      for (const id of step) chain.add(id)
      if (step.length) next.set(root, step)
    }
    frontier = next
  }
  return new Map([...chains].map(([root, chain]) => [root, [...chain]]))
}

/** Dropped anime whose later seasons were never looked up, or were looked up a month ago. */
export function sequelLookups(entries: Map<string, Entry>, chains: SequelChains, now: number): number[] {
  const out: number[] = []
  for (const e of entries.values()) {
    if (e.status !== 'dropped') continue
    const id = anilistId(e.mediaId)
    const chain = chains[e.mediaId]
    if (id && (!chain || now - chain.at > SEQUEL_MAX_AGE_MS)) out.push(id)
  }
  return out.sort((a, b) => a - b)
}

export function withLookups(chains: SequelChains, found: Map<number, number[]>, at: number): SequelChains {
  const next = { ...chains }
  for (const [root, ids] of found) next[`${PREFIX}${root}`] = { ids: ids.map((id) => `${PREFIX}${id}`), at }
  return next
}

/** Later seasons of everything in Larguei now; taking a title out of Larguei brings them back. */
export function hiddenSequels(entries: Map<string, Entry>, chains: SequelChains): Set<string> {
  const hidden = new Set<string>()
  for (const e of entries.values()) {
    if (e.status === 'dropped') for (const id of chains[e.mediaId]?.ids ?? []) hidden.add(id)
  }
  return hidden
}
