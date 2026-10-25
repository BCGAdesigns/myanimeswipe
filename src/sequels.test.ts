import { describe, expect, it } from 'vitest'
import { applyAction } from './logic'
import { anilistId, hiddenSequels, SEQUEL_MAX_AGE_MS, sequelLookups, walkSequels, withLookups, type SequelChains } from './sequels'
import { directSequels } from './sources/anilist'
import type { Entry, SwipeAction } from './types'

// 1 → 2 → movie 3 → 4; 4 points back to 1 by mistake; 10 → 11; 20 has no sequel.
const GRAPH: Record<number, number[]> = { 1: [2], 2: [3], 3: [4], 4: [1], 10: [11], 11: [], 20: [] }

function fakeAniList() {
  const asked: number[][] = []
  const fetch = async (ids: number[]) => {
    asked.push([...ids].sort((a, b) => a - b))
    return new Map(ids.filter((id) => id in GRAPH).map((id) => [id, GRAPH[id]]))
  }
  return { asked, fetch }
}

const dropped = (n: number, action: SwipeAction = 'dropped') => [`anilist:${n}`, applyAction(`anilist:${n}`, action, 'discover', 1)] as const

describe('walkSequels', () => {
  it('follows the chain season after season, through movies, ignoring cycles', async () => {
    const { fetch } = fakeAniList()
    const chains = await walkSequels([1], fetch)
    expect(chains.get(1)).toEqual([2, 3, 4])
  })

  it('walks every title in the same requests, one step per request, asking each id once', async () => {
    const { asked, fetch } = fakeAniList()
    const chains = await walkSequels([2, 10, 20, 1], fetch)
    expect(chains.get(10)).toEqual([11])
    expect(chains.get(20)).toEqual([])
    expect(chains.get(2)).toEqual([3, 4, 1])
    expect(asked).toEqual([[1, 2, 10, 20], [3, 11], [4]])
  })

  it('stops after the last round', async () => {
    const { asked, fetch } = fakeAniList()
    expect((await walkSequels([1], fetch, 2)).get(1)).toEqual([2, 3])
    expect(asked).toHaveLength(2)
  })

  it('lets a failed request fail the walk, so it runs again later', async () => {
    await expect(walkSequels([1], async () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
  })
})

describe('directSequels', () => {
  it('keeps only anime released after the title', () => {
    const edge = (relationType: string, id: number, type = 'ANIME') => ({ relationType, node: { id, type } })
    const raw = {
      id: 1,
      relations: { edges: [edge('SEQUEL', 2), edge('PREQUEL', 0), edge('SIDE_STORY', 5), edge('SPIN_OFF', 6), edge('SEQUEL', 7, 'MANGA'), null, edge('SEQUEL', 8)] },
    }
    expect(directSequels(raw)).toEqual([2, 8])
    expect(directSequels({ id: 9, relations: null })).toEqual([])
  })
})

describe('hidden sequels', () => {
  const now = 10 * SEQUEL_MAX_AGE_MS
  const chains: SequelChains = {
    'anilist:1': { ids: ['anilist:2', 'anilist:3'], at: now },
    'anilist:10': { ids: ['anilist:11'], at: now - SEQUEL_MAX_AGE_MS - 1 },
  }

  it('hides the later seasons of what is in Larguei now, and brings them back when it leaves', () => {
    const entries = new Map([dropped(1), dropped(10)])
    expect([...hiddenSequels(entries, chains)].sort()).toEqual(['anilist:11', 'anilist:2', 'anilist:3'])
    entries.set(...dropped(1, 'want'))
    expect([...hiddenSequels(entries, chains)]).toEqual(['anilist:11'])
  })

  it('looks up dropped anime never looked up or looked up a month ago, not movies or series', () => {
    const tmdb = applyAction('tmdb:tv:5', 'dropped', 'discover', 1)
    const entries = new Map<string, Entry>([dropped(1), dropped(10), dropped(30), dropped(40, 'want'), ['tmdb:tv:5', tmdb]])
    expect(sequelLookups(entries, chains, now)).toEqual([10, 30])
  })

  it('stores what AniList answered by media id', () => {
    const next = withLookups(chains, new Map([[30, [31, 32]], [40, []]]), 5)
    expect(next['anilist:30']).toEqual({ ids: ['anilist:31', 'anilist:32'], at: 5 })
    expect(next['anilist:40']).toEqual({ ids: [], at: 5 })
    expect(next['anilist:1']).toBe(chains['anilist:1'])
    expect([anilistId('anilist:7'), anilistId('tmdb:movie:7'), anilistId('anilist:x')]).toEqual([7, null, null])
  })
})
