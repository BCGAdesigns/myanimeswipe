import { describe, expect, it } from 'vitest'
import { arrangeEntries, normalizeText, searchLibrary } from '../library'
import type { Entry, Media } from '../types'
import { CODE_LENGTH, codeFromInput, newShareCode } from './api'
import { compareLists, parseSharedList, type SharedEntry } from './compare'

const media = (id: string, over: Partial<Media> = {}): Media => ({
  id,
  source: 'anilist',
  sourceId: 1,
  kind: 'anime',
  title: id,
  cover: '',
  genres: [],
  tags: [],
  links: {},
  ...over,
})

const entry = (mediaId: string, over: Partial<Entry> = {}): Entry => ({
  mediaId,
  status: 'seen',
  rating: null,
  suggestedRating: null,
  via: 'discover',
  updatedAt: 1,
  ...over,
})

const shared = (mediaId: string, over: Partial<SharedEntry> = {}): SharedEntry => ({
  mediaId,
  status: 'seen',
  rating: null,
  suggestedRating: null,
  favorite: false,
  media: media(mediaId),
  ...over,
})

describe('arrangeEntries', () => {
  const m = new Map([
    ['a', media('a', { title: 'Ásia', year: 2001, score: 70, kind: 'movie' })],
    ['b', media('b', { title: 'Bleach', year: 2004, score: 80 })],
    ['c', media('c', { title: 'Cowboy Bebop', year: 1998, score: 86 })],
  ])
  const list = [
    entry('a', { rating: 6, updatedAt: 3 }),
    entry('b', { rating: 9, updatedAt: 1, favorite: true }),
    entry('c', { rating: 9, updatedAt: 2 }),
    entry('gone', { rating: 10, updatedAt: 9 }),
  ]
  const ids = (view: Parameters<typeof arrangeEntries>[2]) => arrangeEntries(list, m, view).map((e) => e.mediaId)
  const base = { kind: 'all' as const, favoritesOnly: false }

  it('sorts in every order, ties broken sensibly, and drops records without media', () => {
    expect(ids({ ...base, sort: 'recent' })).toEqual(['a', 'c', 'b'])
    expect(ids({ ...base, sort: 'rating-desc' })).toEqual(['c', 'b', 'a'])
    expect(ids({ ...base, sort: 'rating-asc' })).toEqual(['a', 'c', 'b'])
    expect(ids({ ...base, sort: 'title' })).toEqual(['a', 'b', 'c'])
    expect(ids({ ...base, sort: 'year' })).toEqual(['b', 'a', 'c'])
    expect(ids({ ...base, sort: 'score' })).toEqual(['c', 'b', 'a'])
  })

  it('filters by kind and favorites', () => {
    expect(ids({ sort: 'title', kind: 'anime', favoritesOnly: false })).toEqual(['b', 'c'])
    expect(ids({ sort: 'title', kind: 'all', favoritesOnly: true })).toEqual(['b'])
  })
})

describe('searchLibrary', () => {
  it('matches without accents or case, on the title or the original title', () => {
    const m = new Map([
      ['p', media('p', { title: 'Pokémon' })],
      ['s', media('s', { title: 'A Viagem de Chihiro', altTitle: 'Sen to Chihiro no Kamikakushi' })],
      ['k', media('k', { title: 'Pokémon Origins' })],
    ])
    const e = new Map([
      ['p', entry('p')],
      ['s', entry('s', { status: 'want' })],
      ['k', entry('k', { status: 'skip' })],
    ])
    expect(searchLibrary('POKEMON', e, m).map((x) => x.id)).toEqual(['p'])
    expect(searchLibrary('kamikakushi', e, m).map((x) => x.id)).toEqual(['s'])
    expect(searchLibrary('a', e, m)).toEqual([])
    expect(normalizeText('  Ação ')).toBe('acao')
  })
})

describe('friend codes', () => {
  it('generates 10 easy-to-read characters', () => {
    for (let i = 0; i < 50; i++) expect(newShareCode()).toMatch(/^[a-hjkmnp-z2-9]{10}$/)
    expect(newShareCode()).toHaveLength(CODE_LENGTH)
  })

  it('reads a typed code or a pasted link', () => {
    expect(codeFromInput(' ABCDE FGHJK ')).toBe('abcdefghjk')
    expect(codeFromInput('https://myanimeswipe.vercel.app/?amigo=abcdefghjk')).toBe('abcdefghjk')
    expect(codeFromInput('abc')).toBeNull()
  })
})

describe('parseSharedList', () => {
  it('keeps valid entries and drops malformed ones', () => {
    const list = parseSharedList({
      name: '  Ana ',
      entries: [
        { mediaId: 'x', status: 'seen', rating: 9, suggestedRating: null, favorite: true, media: { id: 'x', title: 'X' } },
        { mediaId: 'y', status: 'bogus' },
        { status: 'want' },
      ],
    })
    expect(list?.name).toBe('Ana')
    expect(list?.entries).toHaveLength(1)
    expect(list?.entries[0]).toMatchObject({ mediaId: 'x', rating: 9, favorite: true })
    expect(list?.entries[0].media?.genres).toEqual([])
    expect(parseSharedList(null)).toBeNull()
  })
})

describe('compareLists', () => {
  const myMedia = new Map(['w1', 'l1', 'l2', 'l3', 'd1', 'mine1', 'r1'].map((id) => [id, media(id)]))
  const mine = new Map([
    ['w1', entry('w1', { status: 'want' })],
    ['l1', entry('l1', { rating: 9 })],
    ['l2', entry('l2', { rating: 8 })],
    ['l3', entry('l3', { rating: 10 })],
    ['d1', entry('d1', { rating: 9 })],
    ['mine1', entry('mine1', { favorite: true, rating: 10 })],
    ['r1', entry('r1', { status: 'want' })],
  ])
  const theirs = {
    name: 'Ana',
    entries: [
      shared('w1', { status: 'want' }),
      shared('l1', { rating: 9 }),
      shared('l2', { rating: 7 }),
      shared('l3', { rating: 10 }),
      shared('d1', { rating: 2 }),
      shared('t1', { rating: 9 }),
      shared('r1', { favorite: true }),
      shared('mine1', { status: 'want' }),
    ],
  }

  it('finds what both want, both loved, what each recommends and where they disagree', () => {
    const c = compareLists(mine, myMedia, theirs)
    expect(c.bothWant).toEqual(['w1'])
    expect(c.bothLoved).toEqual(['l3', 'l1', 'l2'])
    expect(c.theyRecommend).toEqual(['r1', 't1'])
    expect(c.youRecommend).toEqual(['mine1'])
    expect(c.disagree).toEqual(['d1'])
    expect(c.common).toBe(7)
    // Rated pairs: l1 0, l2 1, l3 0, d1 7 -> mean gap 2 -> 80%.
    expect(c.compatibility).toBe(80)
    // Their snapshot fills in titles the user does not have.
    expect(c.media.get('t1')?.title).toBe('t1')
  })

  it('does not guess compatibility from too little', () => {
    const c = compareLists(new Map([['l1', entry('l1', { rating: 9 })]]), myMedia, { name: null, entries: [shared('l1', { rating: 9 })] })
    expect(c.compatibility).toBeNull()
  })
})
