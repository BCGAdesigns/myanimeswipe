import { describe, expect, it } from 'vitest'
import { byTaste, deckMode, keepHead, PERSONALIZE_AFTER, shuffled } from './discover'
import { applyAction } from './logic'
import { tasteProfile } from './recs/engine'
import type { Entry, Media, SwipeAction } from './types'

const media = (id: string, genres: string[]): Media => ({
  id,
  source: 'anilist',
  sourceId: Number(id.replace(/\D/g, '')),
  kind: 'anime',
  title: id,
  cover: '',
  genres,
  tags: [],
  links: {},
})

describe('deckMode', () => {
  it('follows the catalog until enough titles are classified, unless the user wants a shuffle', () => {
    expect(deckMode('taste', PERSONALIZE_AFTER - 1)).toBe('catalog')
    expect(deckMode('taste', PERSONALIZE_AFTER)).toBe('taste')
    expect(deckMode('random', 0)).toBe('random')
    expect(deckMode('random', 500)).toBe('random')
  })
})

describe('byTaste', () => {
  // Liked romance, dropped and rejected action: romance comes first, action last.
  const library = new Map([
    ['l1', media('l1', ['romance', 'drama'])],
    ['l2', media('l2', ['romance'])],
    ['l3', media('l3', ['action'])],
    ['l4', media('l4', ['action', 'scifi'])],
    ['c1', media('c1', ['action', 'scifi'])],
    ['c2', media('c2', ['comedy'])],
    ['c3', media('c3', ['romance', 'comedy'])],
    ['c4', media('c4', ['action'])],
    ['c5', media('c5', ['romance', 'drama'])],
  ])
  const did = (id: string, action: SwipeAction): [string, Entry] => [id, applyAction(id, action, 'discover', 1)]
  const entries = new Map([did('l1', 'favorite'), did('l2', 'liked'), did('l3', 'dropped'), did('l4', 'reject')])
  const profile = tasteProfile(entries.values(), library)

  it('puts what matches the taste first, then neutral titles, then what the user turns down', () => {
    expect(byTaste(library, profile)(['c1', 'c2', 'c3', 'c4', 'c5'])).toEqual(['c5', 'c3', 'c2', 'c1', 'c4'])
  })

  it('keeps the catalog order among titles that match equally', () => {
    expect(byTaste(library, profile)(['c2', 'x1', 'x2'])).toEqual(['c2', 'x1', 'x2'])
    expect(byTaste(library, new Map())(['c4', 'c1', 'c5'])).toEqual(['c4', 'c1', 'c5'])
  })
})

describe('shuffled', () => {
  it('deals every title once, in an order that holds while others come and go', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `anilist:${i}`)
    const deal = shuffled(42)(ids)
    expect([...deal].sort()).toEqual([...ids].sort())
    expect(deal).not.toEqual(ids)
    const fewer = ids.filter((_, i) => i % 3)
    expect(shuffled(42)(fewer)).toEqual(deal.filter((id) => fewer.includes(id)))
    expect(shuffled(7)(ids)).not.toEqual(deal)
  })

  it('does not leave runs of neighbouring ids', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `anilist:${1000 + i}`)
    for (const seed of [1, 42, 123456789]) {
      const deal = shuffled(seed)(ids)
      const runs = deal.slice(1).filter((id, i) => ids.indexOf(id) === ids.indexOf(deal[i]) + 1).length
      // About 1 expected by chance; FNV alone gave dozens.
      expect(runs).toBeLessThan(6)
    }
  })
})

describe('keepHead', () => {
  it('keeps the cards on screen in place and drops the ones that left the deck', () => {
    expect(keepHead(['c', 'a', 'd', 'b'], ['a', 'b'])).toEqual(['a', 'b', 'c', 'd'])
    // The top card was swiped: the one behind it takes its place.
    expect(keepHead(['c', 'b', 'd'], ['a', 'b'])).toEqual(['b', 'c', 'd'])
    // An undo puts the title back on top.
    expect(keepHead(['b', 'a', 'c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(keepHead(['a', 'b'], ['a', 'a'])).toEqual(['a', 'b'])
    expect(keepHead(['x', 'y'], [])).toEqual(['x', 'y'])
  })
})
