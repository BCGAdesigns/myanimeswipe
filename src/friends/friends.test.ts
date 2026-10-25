import { describe, expect, it } from 'vitest'
import { arrangeEntries, normalizeText, searchLibrary } from '../library'
import type { Entry, Media } from '../types'
import { inviteCodeFromInput, suggestUsername, usernameFromInput } from './api'
import { compareLists, listStats, parseSharedList, sortCommon, type SharedEntry } from './compare'
import { activityText, compatLabel, sentStatus, takeLabel, timeAgo } from './feed'
import { parseAnswers, pickTestItems, scoreTest, type Answers } from './taste'

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
  updatedAt: 1,
  media: media(mediaId),
  ...over,
})

/** Deterministic Math.random replacement. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

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

describe('profile and invite input', () => {
  it('reads usernames typed with @, in any case, or inside a profile link', () => {
    expect(usernameFromInput(' @Ana.Clara ')).toBe('ana.clara')
    expect(usernameFromInput('https://myanimeswipe.vercel.app/?amigo=bia_2')).toBe('bia_2')
    expect(usernameFromInput('ab')).toBeNull()
    expect(usernameFromInput('nome com espaço')).toBeNull()
  })

  it('reads invite codes typed with spaces or inside an invite link', () => {
    expect(inviteCodeFromInput(' ABCDE FGHJK ')).toBe('abcdefghjk')
    expect(inviteCodeFromInput('https://myanimeswipe.vercel.app/?convite=mnpqrstuvw')).toBe('mnpqrstuvw')
    expect(inviteCodeFromInput('@abcdefghjk')).toBeNull()
    expect(inviteCodeFromInput('abc')).toBeNull()
  })

  it('suggests a username from the e-mail', () => {
    expect(suggestUsername('Ze.BCGA+filmes@gmail.com')).toBe('ze.bcgafilmes')
    expect(suggestUsername('ab@x.com')).toBe('')
    expect(suggestUsername(null)).toBe('')
  })
})

describe('parseSharedList', () => {
  it('keeps valid entries and drops malformed ones', () => {
    const list = parseSharedList({
      name: '  Ana ',
      entries: [
        { mediaId: 'x', status: 'seen', rating: 9, suggestedRating: null, favorite: true, updatedAt: 5, media: { id: 'x', title: 'X' } },
        { mediaId: 'y', status: 'bogus' },
        { status: 'want' },
      ],
    })
    expect(list?.name).toBe('Ana')
    expect(list?.entries).toHaveLength(1)
    expect(list?.entries[0]).toMatchObject({ mediaId: 'x', rating: 9, favorite: true, updatedAt: 5 })
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

  it('finds what both want, both loved, what each can suggest and where they disagree', () => {
    const c = compareLists(mine, myMedia, theirs)
    expect(c.bothWant).toEqual(['w1'])
    expect(c.bothLoved).toEqual(['l3', 'l1'])
    expect(c.theyRecommend.map((s) => s.id)).toEqual(['r1', 't1'])
    // Shown on the 1 to 8 scale: the stored 9 is a 7.
    expect(c.theyRecommend[1].take.rating).toBe(7)
    // Already on their Quero ver: the user can tell them, rather than recommend.
    expect(c.youCanTell.map((s) => s.id)).toEqual(['mine1'])
    expect(c.youRecommend).toEqual([])
    expect(c.disagree.map((d) => d.id)).toEqual(['d1'])
    expect(c.common).toHaveLength(7)
    // Their snapshot fills in titles the user does not have.
    expect(c.media.get('t1')?.title).toBe('t1')
  })

  it('scores compatibility from the ratings, pulled toward 50% while there is little in common', () => {
    const c = compareLists(mine, myMedia, theirs)
    // On the 1 to 8 scale the gaps are 0, 1, 0 and 5: agreement 1 + 2/3 + 1 + 0 over 4 titles,
    // plus 2 titles' worth of 50%.
    expect(c.compatibility).toBe(61)
    expect(c.ratedTogether).toBe(4)
    expect(c.meanGap).toBe(1.5)
    expect(c.sameRating).toBe(2)

    const many = Array.from({ length: 10 }, (_, i) => `x${i}`)
    const same = compareLists(
      new Map(many.map((id) => [id, entry(id, { rating: 8 })])),
      new Map(many.map((id) => [id, media(id)])),
      { name: null, entries: many.map((id) => shared(id, { rating: 8 })) },
    )
    expect(same.compatibility).toBe(92)
    const opposite = compareLists(
      new Map(many.map((id) => [id, entry(id, { rating: 9 })])),
      new Map(many.map((id) => [id, media(id)])),
      { name: null, entries: many.map((id) => shared(id, { rating: 3 })) },
    )
    expect(opposite.compatibility).toBe(8)
  })

  it('does not guess compatibility from too little', () => {
    const c = compareLists(new Map([['l1', entry('l1', { rating: 9 })]]), myMedia, { name: null, entries: [shared('l1', { rating: 9 })] })
    expect(c.compatibility).toBeNull()
  })

  it('ranks suggestions by how well they fit the other person', () => {
    const genres = (g: string) => ({ genres: [g] })
    const myMedia2 = new Map([
      ['horror1', media('horror1', genres('Horror'))],
      ['romance1', media('romance1', genres('Romance'))],
    ])
    const mine2 = new Map([
      ['horror1', entry('horror1', { rating: 9 })],
      ['romance1', entry('romance1', { rating: 9 })],
    ])
    // The friend loves romance and dislikes horror.
    const theirs2 = {
      name: null,
      entries: [shared('r2', { rating: 10, media: media('r2', genres('Romance')) }), shared('h2', { rating: 1, media: media('h2', genres('Horror')) })],
    }
    const c = compareLists(mine2, myMedia2, theirs2)
    expect(c.youRecommend.map((s) => s.id)).toEqual(['romance1', 'horror1'])
    expect(c.youRecommend[0].fit).toBeGreaterThan(c.youRecommend[1].fit)
  })

  it('sorts the side by side list', () => {
    const c = compareLists(mine, myMedia, theirs)
    expect(sortCommon(c.common, 'different')[0].id).toBe('d1')
    expect(sortCommon(c.common, 'similar').slice(0, 2).map((r) => r.id)).toEqual(['l3', 'l1'])
    expect(sortCommon(c.common, 'theirs')[0].id).toBe('l3')
    expect(sortCommon(c.common, 'mine').slice(0, 1).map((r) => r.id)).toEqual(['l3'])
    // Titles without two ratings go last.
    expect(sortCommon(c.common, 'similar').slice(-3).every((r) => r.gap === null)).toBe(true)
  })

  it('counts profile numbers', () => {
    expect(listStats(theirs.entries)).toEqual({ seen: 6, rated: 5, average: 6, favorites: 1, want: 2, watching: 0 })
  })
})

describe('taste test', () => {
  const myMedia = new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, media(id)]))
  const mine = new Map([
    ['a', entry('a', { rating: 9 })],
    ['b', entry('b', { rating: 2 })],
    ['c', entry('c', { status: 'watching' })],
    ['d', entry('d', { status: 'want' })],
    ['e', entry('e', { rating: 7 })],
  ])
  const theirs = [shared('a', { rating: 10 }), shared('b', { rating: 8 }), shared('x', { rating: 6 }), shared('y', { status: 'dropped' }), shared('d', { status: 'want' })]

  it('picks known titles from both sides, without repeats or unknown ones', () => {
    const items = pickTestItems(mine, myMedia, theirs, seeded(7))
    const ids = items.map((i) => i.mediaId)
    expect(new Set(ids).size).toBe(ids.length)
    // d is only wanted by both: nobody can have an opinion yet.
    expect(ids).not.toContain('d')
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'e', 'x', 'y'])
    expect(items.every((i) => i.media.tags.length === 0 && !i.media.synopsis)).toBe(true)
  })

  it('caps the size and mixes the pools', () => {
    const many = Array.from({ length: 30 }, (_, i) => `m${i}`)
    const lots = new Map(many.map((id) => [id, entry(id, { rating: 8 })]))
    const lotsMedia = new Map(many.map((id) => [id, media(id)]))
    const friend = Array.from({ length: 30 }, (_, i) => shared(`f${i}`, { rating: 6 }))
    const items = pickTestItems(lots, lotsMedia, friend, seeded(3), 8)
    expect(items).toHaveLength(8)
    expect(items.some((i) => i.mediaId.startsWith('m'))).toBe(true)
    expect(items.some((i) => i.mediaId.startsWith('f'))).toBe(true)
  })

  it('scores taste and guesses', () => {
    const items = ['a', 'b', 'c'].map((id) => ({ mediaId: id, media: media(id) }))
    const me: Answers = {
      a: { opinion: 'love', guess: 'love' },
      b: { opinion: 'dislike', guess: 'like' },
      c: { opinion: 'unseen', guess: 'meh' },
    }
    const them: Answers = {
      a: { opinion: 'love', guess: 'like' },
      b: { opinion: 'love', guess: 'dislike' },
      c: { opinion: 'like', guess: 'unseen' },
    }
    const s = scoreTest(items, me, them)
    // a identical, b opposite; c does not count (unseen on one side).
    expect(s.taste).toBe(50)
    expect(s.tasteBasis).toBe(2)
    // I got a right; b and c were close (one step away), which does not count as right.
    expect(s.myGuesses).toBe(1)
    expect(s.items[1].iGuessed).toBe('close')
    // They got b and c right, a was close.
    expect(s.theirGuesses).toBe(2)
    expect(s.items[0].theyGuessed).toBe('close')
  })

  it('drops malformed answers', () => {
    expect(parseAnswers({ a: { opinion: 'love', guess: 'meh' }, b: { opinion: 'nope', guess: 'meh' }, c: null })).toEqual({
      a: { opinion: 'love', guess: 'meh' },
    })
    expect(parseAnswers(null)).toBeNull()
  })
})

describe('feed wording', () => {
  it('describes activity', () => {
    const base = { rating: null, suggestedRating: null, favorite: false }
    expect(activityText({ ...base, status: 'seen', rating: 9 })).toBe('deu nota 7')
    expect(activityText({ ...base, status: 'seen', suggestedRating: 10 })).toBe('deu nota 8')
    expect(activityText({ ...base, status: 'seen' })).toBe('já viu')
    expect(activityText({ ...base, status: 'seen', rating: 10, favorite: true })).toBe('favoritou')
    expect(activityText({ ...base, status: 'want' })).toBe('quer ver')
    expect(activityText({ ...base, status: 'dropped' })).toBe('largou')
  })

  it('says how long ago', () => {
    const now = Date.UTC(2026, 9, 25, 12)
    expect(timeAgo(now - 30_000, now)).toBe('agora')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min')
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h')
    expect(timeAgo(now - 30 * 3_600_000, now)).toBe('ontem')
    expect(timeAgo(new Date(now - 4 * 86_400_000).toISOString(), now)).toBe('4 dias')
    expect(timeAgo(now - 40 * 86_400_000, now)).toMatch(/set/)
  })

  it('reports what happened to a sent recommendation', () => {
    const base = { theirStatus: null, theirRating: null, theirFavorite: null, dismissed: false, likedAt: null, seenAt: null }
    expect(sentStatus(base).text).toBe('Ainda não viu')
    expect(sentStatus({ ...base, seenAt: 'x' }).text).toBe('Viu a indicação')
    expect(sentStatus({ ...base, seenAt: 'x', likedAt: 'y' }).text).toBe('Curtiu a indicação')
    expect(sentStatus({ ...base, theirStatus: 'want' })).toEqual({ text: 'Colocou na lista Quero ver', tone: 'good' })
    expect(sentStatus({ ...base, theirStatus: 'seen', theirRating: 3 })).toEqual({ text: 'Viu e deu nota 3', tone: 'bad' })
    expect(sentStatus({ ...base, theirStatus: 'seen', theirRating: 8 })).toEqual({ text: 'Viu e deu nota 7', tone: 'good' })
    expect(sentStatus({ ...base, theirStatus: 'seen', theirRating: 9, theirFavorite: true }).text).toBe('Viu e favoritou')
    expect(sentStatus({ ...base, dismissed: true }).text).toBe('Dispensou')
  })

  it('labels takes and compatibility', () => {
    expect(takeLabel({ status: 'seen', rating: 7, favorite: false })).toBe('7')
    expect(takeLabel({ status: 'watching', rating: null, favorite: false })).toBe('Vendo')
    expect(compatLabel(90)).toBe('Gosto quase idêntico')
    expect(compatLabel(30)).toBe('Gostos opostos')
  })
})
